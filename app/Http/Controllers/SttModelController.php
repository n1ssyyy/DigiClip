<?php

namespace App\Http\Controllers;

use App\Jobs\DownloadModelJob;
use App\Services\Stt\ModelManager;
use Illuminate\Support\Facades\Cache;

class SttModelController extends Controller
{
    /** Live per-model disk/download state for the picker (polled). */
    public function index(ModelManager $models)
    {
        $out = [];
        foreach (config('digiclip.stt.models', []) as $id => $meta) {
            $state = $models->downloadState($id);
            $out[$id] = [
                'size_mb' => $meta['size_mb'] ?? 0,
                'downloaded' => $state['status'] === 'downloaded',
                'downloading' => $state['status'] === 'downloading',
                'progress' => $state['progress'],
                'failed' => $state['status'] === 'failed',
                'error' => $state['error'],
            ];
        }

        return response()->json(['models' => $out]);
    }

    /** Selecting a model starts its download; the job runs in the background. */
    public function download(string $model, ModelManager $models)
    {
        if (! isset(config('digiclip.stt.models', [])[$model])) {
            abort(404, 'Unknown transcription model.');
        }
        $state = $models->downloadState($model);
        if ($state['status'] === 'downloaded') {
            return response()->json(['status' => 'downloaded']);
        }
        if ($state['status'] === 'downloading') {
            return response()->json(['status' => 'downloading', 'progress' => $state['progress']], 202);
        }

        Cache::forget(ModelManager::downloadProgressKey($model));
        DownloadModelJob::dispatch($model)->onQueue('default');

        return response()->json(['status' => 'queued'], 202);
    }
}
