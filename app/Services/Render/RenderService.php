<?php

namespace App\Services\Render;

use App\Models\ClipCandidate;
use App\Models\Render;
use App\Services\Captions\AssBuilder;
use App\Services\Captions\SrtBuilder;
use App\Services\Stt\BinaryManager;
use RuntimeException;
use Symfony\Component\Process\Process;

/**
 * Clip → 1080×1920 captioned MP4 (PLAN.MD §7).
 * Center-crop 9:16 (face-track replaces the crop expr in V2), libass burn,
 * loudnorm mobile audio, H.264 + faststart. Progress 0–100 via callback.
 */
class RenderService
{
    public function __construct(
        private BinaryManager $binaries,
        private AssBuilder $ass,
        private SrtBuilder $srt,
    ) {}

    public function render(ClipCandidate $clip, ?callable $onProgress = null, ?Render $existing = null): Render
    {
        $project = $clip->project;
        $words = $project->transcript?->words() ?? [];
        $slice = array_values(array_filter(
            $words,
            fn ($w) => $w['e'] > $clip->start_s && $w['s'] < $clip->end_s
        ));
        if ($slice === []) {
            throw new RuntimeException('No transcript words inside clip range.');
        }

        $dir = storage_path("app/projects/{$project->id}/clips/{$clip->id}");
        @mkdir($dir, 0755, true);

        $assPath = "{$dir}/clip.ass";
        file_put_contents($assPath, $this->ass->build($slice, $clip->caption_style));
        $srtPath = "{$dir}/clip.srt";
        file_put_contents($srtPath, $this->srt->fromWords($slice));

        $rel = fn ($abs) => ltrim(str_replace(storage_path('app').'/', '', $abs), '/');
        $render = $existing ?? Render::create([
            'clip_candidate_id' => $clip->id,
            'preset' => $clip->caption_style,
            'status' => 'rendering',
        ]);
        $render->update([
            'ass_path' => $rel($assPath),
            'srt_path' => $rel($srtPath),
            'status' => 'rendering',
        ]);

        $source = \Illuminate\Support\Facades\Storage::disk('local')->path($project->source_path);
        $mp4Abs = "{$dir}/clip-9x16.mp4";
        $dur = max(1.0, $clip->end_s - $clip->start_s);
        $encoder = $this->pickEncoder();
        $render->update(['encoder' => $encoder]);

        $vf = sprintf(
            'crop=ih*9/16:ih,scale=1080:1920:flags=lanczos,ass=%s:fontsdir=%s,format=yuv420p',
            $this->filterEscape($assPath),
            $this->filterEscape(resource_path('fonts'))
        );
        $cmd = array_merge(
            [$this->binaries->require('ffmpeg'), '-y', '-ss', (string) $clip->start_s, '-t', (string) $dur, '-i', $source,
                '-vf', $vf, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000',
                '-c:v', $encoder],
            $encoder === 'libx264' ? ['-preset', 'veryfast'] : [],
            ['-crf', '20', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
                '-progress', 'pipe:1', '-nostats', $mp4Abs]
        );

        $lastPct = -1;
        $p = new Process($cmd);
        $p->setTimeout(1800);
        $projectId = $project->id;
        $clipId = $clip->id;
        $renderId = $render->id;
        try {
            $p->mustRun(function ($type, $buf) use (&$lastPct, $dur, $render, $onProgress, $projectId, $clipId, $renderId) {
                if (preg_match_all('/out_time_ms=(\d+)/', $buf, $m)) {
                    $pct = (int) min(100, ((int) end($m[1]) / 1000000) / $dur * 100);
                    if ($pct >= $lastPct + 5) {
                        $lastPct = $pct;
                        $render->update(['progress' => $pct]);
                        try {
                            event(new \App\Events\RenderProgressChanged($projectId, $clipId, $renderId, $pct, 'rendering'));
                        } catch (\Throwable) {
                        }
                        $onProgress && $onProgress($pct);
                    }
                }
            });
        } catch (\Throwable $e) {
            $render->update(['status' => 'failed', 'error' => mb_substr($e->getMessage(), 0, 500)]);
            try {
                event(new \App\Events\RenderProgressChanged($projectId, $clipId, $renderId, $lastPct, 'failed'));
            } catch (\Throwable) {
            }
            throw new RuntimeException('Render failed: '.mb_substr($p->getErrorOutput(), -400));
        }
        if (! is_file($mp4Abs)) {
            $render->update(['status' => 'failed', 'error' => 'ffmpeg produced no file.']);
            throw new RuntimeException('ffmpeg produced no file.');
        }
        $render->update(['mp4_path' => $rel($mp4Abs), 'progress' => 100, 'status' => 'done']);
        try {
            event(new \App\Events\RenderProgressChanged($projectId, $clipId, $renderId, 100, 'done'));
        } catch (\Throwable) {
        }

        return $render->fresh();
    }

    public function pickEncoder(): string
    {
        try {
            $p = new Process([$this->binaries->require('ffmpeg'), '-hide_banner', '-encoders']);
            $p->mustRun();
            $list = $p->getOutput();
        } catch (\Throwable) {
            return 'libx264';
        }
        return match (true) {
            PHP_OS_FAMILY === 'Darwin' && str_contains($list, 'h264_videotoolbox') => 'h264_videotoolbox',
            str_contains($list, 'h264_nvenc') && $this->hasNvidia() => 'h264_nvenc',
            default => 'libx264',
        };
    }

    private function hasNvidia(): bool
    {
        try {
            $p = new Process(['nvidia-smi', '-L']);
            $p->run();

            return $p->isSuccessful();
        } catch (\Throwable) {
            return false;
        }
    }

    /** Escape a path for use inside an ffmpeg -vf filter argument. */
    public function filterEscape(string $path): string
    {
        $path = str_replace('\\', '/', $path);

        return "'".str_replace(["'", ':', ','], ["\\'", '\\:', '\\,'], $path)."'";
    }
}
