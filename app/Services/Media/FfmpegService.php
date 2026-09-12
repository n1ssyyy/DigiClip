<?php

namespace App\Services\Media;

use App\Services\Stt\BinaryManager;
use RuntimeException;
use Symfony\Component\Process\Process;

/**
 * ffmpeg wrapper (PLAN.MD §3, §7). Tolerant: ffprobe preferred, falls back to
 * parsing `ffmpeg -i` stderr. All meta fields nullable — never block ingest.
 */
class FfmpegService
{
    public function __construct(private BinaryManager $binaries) {}

    public function extractWav(string $source, string $dest, int $rate = 16000): void
    {
        $ffmpeg = $this->binaries->require('ffmpeg');
        @mkdir(dirname($dest), 0755, true);
        $p = new Process([$ffmpeg, '-y', '-i', $source, '-ar', (string) $rate, '-ac', '1', '-c:a', 'pcm_s16le', $dest]);
        $p->setTimeout(600);
        try {
            $p->mustRun();
        } catch (\Throwable $e) {
            throw new RuntimeException('Audio extract failed: '.mb_substr($p->getErrorOutput(), -500));
        }
        if (! is_file($dest)) {
            throw new RuntimeException('Audio extract produced no file.');
        }
    }

    /**
     * Grab a single poster frame (~1s in, 320px wide). Tolerant: returns
     * false on any failure — never block ingest for a thumbnail.
     */
    public function poster(string $source, string $dest): bool
    {
        try {
            $ffmpeg = $this->binaries->require('ffmpeg');
            @mkdir(dirname($dest), 0755, true);
            $p = new Process([
                $ffmpeg, '-y', '-ss', '1', '-i', $source,
                '-frames:v', '1', '-vf', 'scale=320:-1', '-q:v', '4', $dest,
            ]);
            $p->setTimeout(120);
            $p->mustRun();
        } catch (\Throwable) {
            return false;
        }

        return is_file($dest);
    }

    /**
     * @return array{duration_s: ?float, width: ?int, height: ?int}
     */
    public function probe(string $source): array
    {
        $viaProbe = $this->probeViaFfprobe($source);
        if ($viaProbe) {
            return $viaProbe;
        }

        return $this->probeViaFfmpegStderr($source);
    }

    private function probeViaFfprobe(string $source): ?array
    {
        $ffprobe = $this->binaries->resolve('ffprobe');
        if (! $ffprobe) {
            return null;
        }
        try {
            $p = new Process([$ffprobe, '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', $source]);
            $p->mustRun();
            $info = json_decode($p->getOutput(), true);
            $video = collect($info['streams'] ?? [])->firstWhere('codec_type', 'video');
            $dur = $info['format']['duration'] ?? $video['duration'] ?? null;

            return [
                'duration_s' => $dur !== null ? round((float) $dur, 2) : null,
                'width' => isset($video['width']) ? (int) $video['width'] : null,
                'height' => isset($video['height']) ? (int) $video['height'] : null,
            ];
        } catch (\Throwable) {
            return null;
        }
    }

    private function probeViaFfmpegStderr(string $source): array
    {
        try {
            $ffmpeg = $this->binaries->require('ffmpeg');
            $p = new Process([$ffmpeg, '-hide_banner', '-i', $source]);
            $p->run();
            $err = $p->getErrorOutput();
        } catch (\Throwable) {
            return ['duration_s' => null, 'width' => null, 'height' => null];
        }
        $dur = preg_match('/Duration: (\d+):(\d+):([\d.]+)/', $err, $m)
            ? ((int) $m[1] * 3600 + (int) $m[2] * 60 + (float) $m[3]) : null;
        $wh = preg_match('/Video:.*?(\d{2,5})x(\d{2,5})/', $err, $m) ? [(int) $m[1], (int) $m[2]] : [null, null];

        return ['duration_s' => $dur !== null ? round($dur, 2) : null, 'width' => $wh[0], 'height' => $wh[1]];
    }
}
