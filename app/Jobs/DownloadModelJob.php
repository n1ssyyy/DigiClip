<?php

namespace App\Jobs;

use App\Services\Notifications\Notifier;
use App\Services\Stt\ModelManager;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;
use Throwable;

class DownloadModelJob implements ShouldQueue
{
    use Queueable;

    /** Large models (3GB) on slow links: generous, tries stay 1 (resume via .part). */
    public int $timeout = 7200;

    public int $tries = 1;

    public function __construct(public string $model) {}

    public function handle(ModelManager $models, Notifier $notify): void
    {
        if ($models->isDownloaded($this->model)) {
            Cache::forget(ModelManager::downloadProgressKey($this->model));

            return;
        }

        try {
            $key = ModelManager::downloadProgressKey($this->model);
            $models->download($this->model, function ($pct) use ($key) {
                static $last = -1;
                if ($pct !== $last) {
                    $last = $pct;
                    Cache::put($key, ['status' => 'downloading', 'progress' => $pct], 7200);
                }
            });
            Cache::forget($key);
            $notify->send('success', 'Model downloaded', "{$this->model} is on disk and ready to transcribe.");
        } catch (Throwable $e) {
            // Recorded, not rethrown: the picker reads this state to offer a
            // retry, and the user is notified either way.
            $this->parkFailed($e->getMessage());
        }
    }

    /** Worker died (timeout/SIGKILL): park a retryable failed state. */
    public function failed(Throwable $e): void
    {
        $this->parkFailed($e->getMessage());
    }

    private function parkFailed(string $message): void
    {
        Cache::put(ModelManager::downloadProgressKey($this->model), [
            'status' => 'failed',
            'error' => mb_substr($message, 0, 200),
        ], 7200);
        app(Notifier::class)->send('error', 'Model download failed', "{$this->model} — ".mb_substr($message, 0, 160));
    }
}
