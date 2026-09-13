<?php

namespace Tests\Feature;

use App\Jobs\AnalyzeClipsJob;
use App\Models\Project;
use App\Models\Setting;
use App\Models\Transcript;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AnalyzeFallbackTest extends TestCase
{
    use RefreshDatabase;

    private function projectWithTranscript(): Project
    {
        $project = Project::create([
            'name' => 't', 'source_path' => 'x.mp4', 'mime' => 'video/mp4',
            'size_bytes' => 1, 'duration_s' => 60.0, 'status' => 'transcribed',
        ]);
        $words = [];
        for ($i = 0; $i < 100; $i++) {
            $words[] = ['w' => $i % 10 === 0 ? 'really?' : 'word', 's' => $i * 0.5, 'e' => $i * 0.5 + 0.4, 'conf' => 0.9];
        }
        Transcript::create([
            'project_id' => $project->id, 'model' => 'base.en', 'lang' => 'en',
            'full_text' => 'x', 'words_json' => json_encode($words),
            'segments_json' => '[]', 'status' => 'done',
        ]);

        return $project;
    }

    public function test_403_falls_back_to_heuristic(): void
    {
        Bus::fake();
        Setting::set('openrouter_key', 'sk-test');
        Http::fake(['*' => Http::response(['error' => ['message' => 'gated', 'code' => 403]], 403)]);

        $project = $this->projectWithTranscript();
        (new AnalyzeClipsJob($project->id))->handle(
            app(\App\Services\Clips\OpenRouterClient::class),
            app(\App\Services\Clips\ClipValidator::class),
            app(\App\Services\Clips\HeuristicScorer::class),
            app(\App\Services\Notifications\Notifier::class),
        );

        $project->refresh();
        $this->assertSame('clips_ready', $project->status);
        $this->assertGreaterThan(0, $project->clipCandidates()->count());
        $this->assertSame('heuristic', $project->clipCandidates()->first()->source);
        $this->assertStringContainsString('LLM refused (403)', $project->usage_json['note']);
        // Clips are made, not proposed: one queued render per candidate.
        $this->assertSame(
            $project->clipCandidates()->count(),
            \App\Models\Render::where('status', 'queued')->count(),
        );
        Bus::assertDispatched(\App\Jobs\RenderClipJob::class, $project->clipCandidates()->count());
    }

    public function test_500_still_throws_for_retry(): void
    {
        Setting::set('openrouter_key', 'sk-test');
        Http::fake(['*' => Http::response('boom', 500)]);

        $project = $this->projectWithTranscript();
        $this->expectException(\App\Services\Clips\OpenRouterException::class);
        (new AnalyzeClipsJob($project->id))->handle(
            app(\App\Services\Clips\OpenRouterClient::class),
            app(\App\Services\Clips\ClipValidator::class),
            app(\App\Services\Clips\HeuristicScorer::class),
            app(\App\Services\Notifications\Notifier::class),
        );
    }
}
