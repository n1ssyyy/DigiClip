<?php

namespace App\Services\Stt;

use RuntimeException;

/**
 * whisper.cpp ggml model manager.
 * Models live in storage/app/digiclip/models (user-data, never in the bundle).
 * Default `base.en` 142MB, seconds to download; turbo upgrades lazy.
 */
class ModelManager
{
    public function __construct(private BinaryManager $binaries) {}

    public function dir(): string
    {
        $dir = storage_path('app/digiclip/models');
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        return $dir;
    }

    /** Model IDs contain dots (e.g. base.en), index the array directly, never via dot notation. */
    private function meta(string $model): array
    {
        $meta = config('digiclip.stt.models', [])[$model] ?? null;
        if (! $meta) {
            throw new RuntimeException("Unknown STT model [{$model}].");
        }

        return $meta;
    }

    public function fileFor(string $model): string
    {
        return $this->dir().'/'.$this->meta($model)['file'];
    }

    public function isDownloaded(string $model): bool
    {
        $path = $this->fileFor($model);
        if (! is_file($path)) {
            return false;
        }
        $expectedMb = (int) ($this->meta($model)['size_mb'] ?? 0);

        return $expectedMb <= 0 || filesize($path) > $expectedMb * 1024 * 1024 * 0.9;
    }

    public function require(string $model): string
    {
        if (! $this->isDownloaded($model)) {
            throw new RuntimeException("STT model [{$model}] not downloaded yet. Download it from Settings.");
        }

        return $this->fileFor($model);
    }

    public function downloadUrl(string $model): string
    {
        $file = $this->meta($model)['file'];

        return "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{$file}";
    }

    /**
     * Stream-download with progress (0-100). Resumable via Range when the server allows.
     */
    public function download(string $model, ?callable $onProgress = null): string
    {
        $dest = $this->fileFor($model).'.part';
        $final = $this->fileFor($model);
        $resumeFrom = is_file($dest) ? filesize($dest) : 0;

        $fp = fopen($dest, $resumeFrom > 0 ? 'ab' : 'wb');
        $ch = curl_init($this->downloadUrl($model));
        curl_setopt_array($ch, [
            CURLOPT_FILE => $fp,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_FAILONERROR => true,
            CURLOPT_NOPROGRESS => false,
            CURLOPT_TIMEOUT => 0,
            CURLOPT_PROGRESSFUNCTION => function ($ch, $dlTotal, $dlNow) use ($onProgress, $resumeFrom) {
                if ($onProgress && $dlTotal > 0) {
                    $onProgress(min(100, (int) ((($resumeFrom + $dlNow) / ($resumeFrom + $dlTotal)) * 100)));
                }
            },
        ]);
        if ($resumeFrom > 0) {
            curl_setopt($ch, CURLOPT_RANGE, $resumeFrom.'-');
        }
        $ok = curl_exec($ch);
        $err = curl_error($ch);
        curl_close($ch);
        fclose($fp);

        if (! $ok) {
            throw new RuntimeException("Model download failed: {$err}");
        }
        rename($dest, $final);

        return $final;
    }
}
