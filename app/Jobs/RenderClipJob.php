<?php

namespace App\Jobs;

use App\Models\ClipCandidate;
use App\Services\Notifications\Notifier;
use App\Services\Render\RenderService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

class RenderClipJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 1800;

    public int $tries = 1;

    public function __construct(public int $clipId, public ?int $renderId = null) {}

    public function handle(RenderService $renderer, Notifier $notify): void
    {
        $clip = ClipCandidate::findOrFail($this->clipId);
        $existing = $this->renderId ? \App\Models\Render::find($this->renderId) : null;
        $render = $renderer->render($clip, function (int $pct) {
            if ($this->renderId) {
                \App\Models\Render::whereKey($this->renderId)->update(['progress' => $pct]);
            }
        }, $existing);
        if ($this->renderId && $render->id !== $this->renderId) {
            $this->renderId = $render->id;
        }

        // One ping per project, not per clip: only when every render landed.
        $project = $clip->project;
        if ($project) {
            $renderIds = \App\Models\Render::whereHas(
                'clipCandidate', fn ($q) => $q->where('project_id', $project->id)
            );
            if ((clone $renderIds)->count() > 0 && (clone $renderIds)->where('status', 'done')->count() === (clone $renderIds)->count()) {
                $notify->send('success', 'Clips rendered', "{$project->name} — all done.", ['project_id' => $project->id]);
            }
        }
    }

    public function failed(Throwable $e): void
    {
        $clip = ClipCandidate::find($this->clipId);
        if ($this->renderId) {
            \App\Models\Render::whereKey($this->renderId)->update([
                'status' => 'failed',
                'error' => mb_substr($e->getMessage(), 0, 500),
            ]);
        }
        app(Notifier::class)->send('error', 'Render failed', ($clip ? "{$clip->title} — " : '').mb_substr($e->getMessage(), 0, 160), $clip?->project_id ? ['project_id' => $clip->project_id] : []);
    }
}
