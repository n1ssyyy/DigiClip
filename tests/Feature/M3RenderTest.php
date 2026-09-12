<?php

namespace Tests\Feature;

use App\Models\ClipCandidate;
use App\Models\Project;
use App\Models\Transcript;
use App\Services\Render\RenderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class M3RenderTest extends TestCase
{
    use RefreshDatabase;

    public function test_renders_vertical_captioned_mp4(): void
    {
        $ffmpeg = resource_path('bin/linux-x64/ffmpeg');
        $ffprobe = resource_path('bin/linux-x64/ffprobe');
        foreach ([$ffmpeg, $ffprobe] as $bin) {
            if (! is_file($bin)) {
                $this->markTestSkipped('missing M3 binaries');
            }
        }
        if (! is_file(base_path('tests/Fixtures/sample.mp4'))) {
            $this->markTestSkipped('missing fixture video');
        }

        \Illuminate\Support\Facades\Storage::disk('local')->put(
            'm3-source.mp4', file_get_contents(base_path('tests/Fixtures/sample.mp4'))
        );
        $project = Project::create([
            'name' => 'm3', 'source_path' => 'm3-source.mp4',
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
}
