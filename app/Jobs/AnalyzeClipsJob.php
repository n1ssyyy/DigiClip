<?php

namespace App\Jobs;

use App\Models\ClipCandidate;
use App\Models\Project;
use App\Services\Clips\ClipPrompt;
use App\Services\Clips\ClipValidator;
use App\Services\Clips\HeuristicScorer;
use App\Services\Clips\OpenRouterClient;
use App\Services\Clips\OpenRouterException;
use App\Services\Notifications\Notifier;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Bus;
use Throwable;

class AnalyzeClipsJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 300;

    public int $tries = 2;

    public function __construct(public int $projectId) {}

    public function handle(OpenRouterClient $llm, ClipValidator $validator, HeuristicScorer $heuristic, Notifier $notify): void
    {
        $project = Project::find($this->projectId);
        // Cancelled mid-queue, or paused: exit quietly so the chain drains.
        if (! $project || $project->status === 'paused') {
            return;
        }
        $project->update(['status' => 'analyzing', 'error' => null]);

        $t = $project->transcript;
        if (! $t) {
            throw new \RuntimeException('No transcript to analyze.');
        }
        $words = $t->words();
        $segments = json_decode($t->segments_json ?? '[]', true) ?? [];
        $duration = (float) ($project->duration_s ?? (end($words)['e'] ?? 0));
        $count = (int) (\App\Models\Setting::get('clips_count') ?? config('digiclip.clips.count_default', 3));
        $count = min(10, max(1, $count));

        if ($llm->hasKey()) {
            try {
                $res = $llm->analyze(
                    ClipPrompt::system($count, (int) config('digiclip.clips.target_min_s', 20), (int) config('digiclip.clips.target_max_s', 45)),
                    ClipPrompt::user($words, $segments, $duration)
                );
                $raw = $res['clips'];
                $source = 'llm:'.$llm->model();
                $project->usage_json = [
                    'model' => $llm->model(),
                    'prompt_tokens' => $res['usage']['prompt_tokens'],
                    'completion_tokens' => $res['usage']['completion_tokens'],
                    'cost_cents' => OpenRouterClient::costCents(
                        $llm->model(), $res['usage']['prompt_tokens'], $res['usage']['completion_tokens']
                    ),
                ];
            } catch (OpenRouterException $e) {
                // 4xx = user-fixable (key, credits, model gating): retrying is
                // pointless, fall back to labeled heuristics instead of failing.
                if (! $e->isClientError()) {
                    throw $e;
                }
                $raw = $heuristic->propose($words, $count, 'LLM refused ('.$e->status.')');
                $source = 'heuristic';
                $project->usage_json = [
                    'model' => $llm->model(),
                    'note' => 'LLM refused ('.$e->status.'): '.mb_substr($e->getMessage(), 0, 160),
                ];
            }
        } else {
            $raw = $heuristic->propose($words, $count);
            $source = 'heuristic';
        }

        $clips = $validator->normalize(
            $raw, $words, $duration, $count,
        );

        $project->clipCandidates()->delete();
        $made = [];
        foreach ($clips as $c) {
            $made[] = $project->clipCandidates()->create([...$c, 'source' => $source]);
        }
        $project->update(['status' => 'clips_ready']);
        $notify->send('success', 'Clips ready', "{$project->name} — ".count($made).' clips picked, rendering now.', ['project_id' => $project->id]);

        // Clips are made, not proposed: render every candidate right away.
        foreach ($made as $candidate) {
            $render = $candidate->renders()->create([
                'preset' => $candidate->caption_style,
                'status' => 'queued',
            ]);
            Bus::dispatch((new RenderClipJob($candidate->id, $render->id))->onQueue('render'));
        }
    }

    public function failed(Throwable $e): void
    {
        $project = Project::find($this->projectId);
        $project?->update([
            'status' => 'failed',
            'error' => mb_substr($e->getMessage(), 0, 500),
        ]);
        app(Notifier::class)->send('error', 'Clip picking failed', ($project ? "{$project->name} — " : '').mb_substr($e->getMessage(), 0, 160), $project ? ['project_id' => $project->id] : []);
    }
}
