<?php

namespace Tests\Feature;

use App\Models\Project;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Tests\TestCase;

/**
 * Home split view: queue controls (pause/resume/cancel) + media endpoints.
 */
class HomeTest extends TestCase
{
    use RefreshDatabase;

    private function makeProject(array $over = []): Project
    {
        return Project::create(array_merge([
            'name' => 'Test Video',
            'source_path' => 'projects-sources/missing.mp4',
            'mime' => 'video/mp4',
            'size_bytes' => 123,
            'status' => 'queued',
        ], $over));
    }

    public function test_home_renders_with_projects_and_candidates(): void
    {
        $p = $this->makeProject();
        $clip = $p->clipCandidates()->create(['rank' => 1, 'start_s' => 1.5, 'end_s' => 9.0, 'title' => 'Hook']);
        $clip->renders()->create(['preset' => 'tiktok', 'status' => 'done']);

        $this->get('/')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Home')
                ->has('projects', 1)
                ->where('projects.0.name', 'Test Video')
                ->has('projects.0.clip_candidates', 1)
                ->has('projects.0.clip_candidates.0.renders', 1)
                ->has('limits'));
    }

    public function test_pause_freezes_active_project(): void
    {
        $p = $this->makeProject(['status' => 'transcribing']);

        $this->post("/projects/{$p->id}/pause")->assertRedirect();

        $this->assertSame('paused', $p->fresh()->status);
    }

    public function test_pause_ignores_terminal_status(): void
    {
        $p = $this->makeProject(['status' => 'clips_ready']);

        $this->post("/projects/{$p->id}/pause")->assertRedirect();

        $this->assertSame('clips_ready', $p->fresh()->status);
    }

    public function test_resume_requeues_paused_project(): void
    {
        Bus::fake();
        $p = $this->makeProject(['status' => 'paused']);

        $this->post("/projects/{$p->id}/resume")->assertRedirect();

        $this->assertSame('queued', $p->fresh()->status);
        // Fresh project: nothing done yet, full chain from the top.
        Bus::assertChained([
            \App\Jobs\ExtractAudioJob::class,
            \App\Jobs\TranscribeJob::class,
            \App\Jobs\AnalyzeClipsJob::class,
        ]);
    }

    public function test_resume_skips_finished_steps(): void
    {
        Bus::fake();
        // audio.wav + probe data + transcript all exist: only analysis left.
        \Illuminate\Support\Facades\Storage::disk('local')->put('projects-sources/keep.mp4', 'x');
        $p = $this->makeProject(['status' => 'paused', 'source_path' => 'projects-sources/keep.mp4', 'duration_s' => 42.0]);
        @mkdir(storage_path("app/projects/{$p->id}"), 0755, true);
        file_put_contents(storage_path("app/projects/{$p->id}/audio.wav"), 'RIFF');
        $p->transcript()->create(['model' => 'test', 'lang' => 'en', 'full_text' => 'x', 'words_json' => '[]', 'segments_json' => '[]', 'status' => 'done']);

        $this->post("/projects/{$p->id}/resume")->assertRedirect();

        Bus::assertChained([\App\Jobs\AnalyzeClipsJob::class]);
    }

    public function test_retry_skips_transcribe_when_transcript_exists(): void
    {
        Bus::fake();
        $p = $this->makeProject(['status' => 'failed', 'error' => 'boom']);
        $p->transcript()->create(['model' => 'test', 'lang' => 'en', 'full_text' => 'x', 'words_json' => '[]', 'segments_json' => '[]', 'status' => 'done']);

        $this->post("/projects/{$p->id}/retry")->assertRedirect();

        // No audio.wav: extract still runs, transcribe is skipped.
        Bus::assertChained([\App\Jobs\ExtractAudioJob::class, \App\Jobs\AnalyzeClipsJob::class]);
    }

    public function test_cancel_removes_project_completely(): void
    {
        $p = $this->makeProject();

        $this->delete("/projects/{$p->id}")->assertRedirect('/');

        $this->assertDatabaseMissing('projects', ['id' => $p->id]);
    }

    public function test_poster_is_404_until_extraction(): void
    {
        $p = $this->makeProject();

        $this->get("/projects/{$p->id}/poster")->assertNotFound();
    }

    public function test_stream_is_404_for_missing_source(): void
    {
        $p = $this->makeProject();

        $this->get("/projects/{$p->id}/stream")->assertNotFound();
    }
}
