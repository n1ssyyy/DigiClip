<?php

namespace Tests\Feature;

use App\Models\Project;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Bus;
use Tests\TestCase;

/**
 * Full ingest pipeline on the sync queue: upload → extract → transcribe.
 * Needs the M1 binaries (skipped otherwise).
 */
class M1PipelineTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['queue.default' => 'sync']);
    }

    public function test_upload_runs_full_chain_to_transcript(): void
    {
        foreach ([resource_path('bin/linux-x64/ffmpeg'), resource_path('bin/linux-x64/whisper-cli'), storage_path('app/digiclip/models/ggml-base.en.bin')] as $path) {
            if (! is_file($path)) {
                $this->markTestSkipped('missing M1 binaries');
            }
        }
        $fixture = base_path('tests/Fixtures/sample.mp4');
        if (! is_file($fixture)) {
            $this->markTestSkipped('missing fixture video');
        }

        $file = new UploadedFile($fixture, 'sample.mp4', 'video/mp4', null, true);
        $this->post('/projects', ['video' => $file])->assertRedirect('/');

        $project = Project::first();
        $this->assertSame('clips_ready', $project->fresh()->status);
        $this->assertEquals(11.0, $project->fresh()->duration_s);
        $this->assertDatabaseHas('transcripts', ['project_id' => $project->id, 'status' => 'done']);
        $this->assertStringContainsString('fellow Americans', $project->fresh()->transcript->full_text);

        $this->get("/projects/{$project->id}/transcript")->assertOk()->assertJsonPath('model', 'base.en');
        $this->get("/projects/{$project->id}/transcript.srt")->assertOk();
    }

    public function test_chain_is_dispatched_on_upload(): void
    {
        Bus::fake();
        $file = UploadedFile::fake()->create('clip.mp4', 100, 'video/mp4');

        $this->post('/projects', ['video' => $file])->assertRedirect('/');

        Bus::assertChained([
            \App\Jobs\ExtractAudioJob::class,
            \App\Jobs\TranscribeJob::class,
            \App\Jobs\AnalyzeClipsJob::class,
        ]);
    }
}
