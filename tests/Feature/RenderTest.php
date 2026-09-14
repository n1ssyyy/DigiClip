<?php

namespace Tests\Feature;

use App\Models\ClipCandidate;
use App\Models\Project;
use App\Models\Transcript;
use App\Services\Render\RenderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class RenderTest extends TestCase
{
    use RefreshDatabase;

    public function test_renders_vertical_captioned_mp4(): void
    {
        $ffmpeg = resource_path('bin/linux-x64/ffmpeg');
        $ffprobe = resource_path('bin/linux-x64/ffprobe');
        foreach ([$ffmpeg, $ffprobe] as $bin) {
            if (! is_file($bin)) {
                $this->markTestSkipped('missing media binaries');
            }
        }
        if (! is_file(base_path('tests/Fixtures/sample.mp4'))) {
            $this->markTestSkipped('missing fixture video');
        }

        \Illuminate\Support\Facades\Storage::disk('local')->put(
            'render-source.mp4', file_get_contents(base_path('tests/Fixtures/sample.mp4'))
        );
        $project = Project::create([
            'name' => 'render', 'source_path' => 'render-source.mp4',
            'mime' => 'video/mp4', 'size_bytes' => 1, 'duration_s' => 11.0,
            'width' => 640, 'height' => 360, 'status' => 'transcribed',
        ]);
        $words = [];
        for ($i = 0; $i < 22; $i++) {
            $words[] = ['w' => "word{$i}", 's' => $i * 0.5, 'e' => $i * 0.5 + 0.4, 'conf' => 0.9];
        }
        Transcript::create([
            'project_id' => $project->id, 'model' => 'test', 'lang' => 'en',
            'full_text' => 'x', 'words_json' => json_encode($words),
            'segments_json' => '[]', 'status' => 'done',
        ]);
        $clip = ClipCandidate::create([
            'project_id' => $project->id, 'rank' => 1, 'start_s' => 2.0, 'end_s' => 8.0,
            'hook_line' => 'hook', 'scores' => [], 'score_total' => 70,
            'title' => 't', 'hashtags' => [], 'caption_style' => 'tiktok', 'source' => 'test',
        ]);

        $seen = [];
        $render = app(RenderService::class)->render($clip->fresh(), function ($pct) use (&$seen) {
            $seen[] = $pct;
        });

        $this->assertSame('done', $render->status);
        $this->assertSame(100, $render->progress);
        $this->assertSame('libx264', $render->encoder);
        $this->assertFileExists(storage_path('app/'.$render->mp4_path));
        $this->assertNotEmpty($seen);

        $ass = file_get_contents(storage_path('app/'.$render->ass_path));
        $this->assertStringContainsString('PlayResX: 1080', $ass);
        $this->assertStringContainsString('{\\k', $ass);

        $probe = new Process([$ffprobe, '-v', 'error', '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height', '-of', 'csv=p=0', storage_path('app/'.$render->mp4_path)]);
        $probe->mustRun();
        $this->assertSame('1080,1920', trim($probe->getOutput()));
    }

    public function test_stream_serves_finished_render_inline(): void
    {
        if (! is_file(base_path('tests/Fixtures/sample.mp4'))) {
            $this->markTestSkipped('missing fixture video');
        }

        // Renders live under storage/app (see RenderService), outside the
        // local disk root, so seed the file exactly where mp4Absolute looks.
        file_put_contents(
            storage_path('app/render-stream.mp4'), file_get_contents(base_path('tests/Fixtures/sample.mp4'))
        );
        $project = Project::create([
            'name' => 'stream', 'source_path' => 'render-stream.mp4',
            'mime' => 'video/mp4', 'size_bytes' => 1, 'status' => 'clips_ready',
        ]);
        $clip = ClipCandidate::create([
            'project_id' => $project->id, 'rank' => 1, 'start_s' => 0, 'end_s' => 5,
        ]);
        $render = $clip->renders()->create([
            'preset' => 'tiktok', 'status' => 'done', 'mp4_path' => 'render-stream.mp4',
        ]);

        $this->get("/renders/{$render->id}/stream")
            ->assertOk()
            ->assertHeader('Content-Type', 'video/mp4');

        $missing = $clip->renders()->create(['preset' => 'tiktok', 'status' => 'failed']);
        $this->get("/renders/{$missing->id}/stream")->assertNotFound();
    }

    public function test_stream_answers_range_requests_with_exact_byte_window(): void
    {
        if (! is_file(base_path('tests/Fixtures/sample.mp4'))) {
            $this->markTestSkipped('missing fixture video');
        }

        file_put_contents(
            storage_path('app/render-range.mp4'), file_get_contents(base_path('tests/Fixtures/sample.mp4'))
        );
        $size = filesize(storage_path('app/render-range.mp4'));
        $project = Project::create([
            'name' => 'range', 'source_path' => 'render-range.mp4',
            'mime' => 'video/mp4', 'size_bytes' => 1, 'status' => 'clips_ready',
        ]);
        $clip = ClipCandidate::create([
            'project_id' => $project->id, 'rank' => 1, 'start_s' => 0, 'end_s' => 5,
        ]);
        $render = $clip->renders()->create([
            'preset' => 'tiktok', 'status' => 'done', 'mp4_path' => 'render-range.mp4',
        ]);

        // Regression: a previous hand-rolled StreamedResponse advertised
        // Content-Length: 100 but sent the whole file (and crashed on
        // Response::setCallback in production). BinaryFileResponse must
        // serve exactly the requested window.
        $response = $this->get("/renders/{$render->id}/stream", ['Range' => 'bytes=0-99']);

        $response->assertStatus(206)
            ->assertHeader('Content-Range', "bytes 0-99/{$size}")
            ->assertHeader('Content-Length', '100');
        $this->assertSame(100, strlen($response->streamedContent()));
    }

    public function test_poster_generates_from_finished_render(): void
    {
        if (! is_file(resource_path('bin/linux-x64/ffmpeg'))) {
            $this->markTestSkipped('missing media binaries');
        }
        if (! is_file(base_path('tests/Fixtures/sample.mp4'))) {
            $this->markTestSkipped('missing fixture video');
        }

        file_put_contents(
            storage_path('app/render-poster.mp4'), file_get_contents(base_path('tests/Fixtures/sample.mp4'))
        );
        $project = Project::create([
            'name' => 'poster', 'source_path' => 'render-poster.mp4',
            'mime' => 'video/mp4', 'size_bytes' => 1, 'status' => 'clips_ready',
        ]);
        $clip = ClipCandidate::create([
            'project_id' => $project->id, 'rank' => 1, 'start_s' => 0, 'end_s' => 5,
        ]);
        $render = $clip->renders()->create([
            'preset' => 'tiktok', 'status' => 'done', 'mp4_path' => 'render-poster.mp4',
        ]);

        $this->get("/renders/{$render->id}/poster")
            ->assertOk()
            ->assertHeader('Content-Type', 'image/jpeg');

        $missing = $clip->renders()->create(['preset' => 'tiktok', 'status' => 'failed']);
        $this->get("/renders/{$missing->id}/poster")->assertNotFound();
    }
}
