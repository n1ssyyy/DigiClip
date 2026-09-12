<?php

namespace App\Jobs;

use App\Models\Project;
use App\Services\Media\FfmpegService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Storage;
use Throwable;

class ExtractAudioJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 600;

    public int $tries = 2;

    public function __construct(public int $projectId) {}

    public function handle(FfmpegService $ffmpeg): void
    {
        $project = Project::find($this->projectId);
        // Cancelled mid-queue, or paused: exit quietly so the chain drains.
        if (! $project || $project->status === 'paused') {
            return;
        }
        $project->update(['status' => 'extracting', 'error' => null]);

        $source = Storage::disk('local')->path($project->source_path);
        $dir = storage_path("app/projects/{$project->id}");
        $ffmpeg->extractWav($source, "{$dir}/audio.wav");

        $meta = $ffmpeg->probe($source);
        $ffmpeg->poster($source, "{$dir}/poster.jpg");
        $project->update([
            'status' => 'extracted',
            'duration_s' => $meta['duration_s'],
            'width' => $meta['width'],
            'height' => $meta['height'],
        ]);
    }

    public function failed(Throwable $e): void
    {
        Project::whereKey($this->projectId)->update([
            'status' => 'failed',
            'error' => mb_substr($e->getMessage(), 0, 500),
        ]);
    }
}
