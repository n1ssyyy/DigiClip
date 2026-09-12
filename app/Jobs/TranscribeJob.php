<?php

namespace App\Jobs;

use App\Models\Project;
use App\Models\Transcript;
use App\Services\Stt\WhisperCppTranscriber;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

class TranscribeJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 1800;

    public int $tries = 1;

    public function __construct(public int $projectId) {}

    public function handle(WhisperCppTranscriber $stt): void
    {
        $project = Project::find($this->projectId);
        // Cancelled mid-queue, or paused: exit quietly so the chain drains.
        if (! $project || $project->status === 'paused') {
            return;
        }
        $project->update(['status' => 'transcribing', 'error' => null]);

        $wav = storage_path("app/projects/{$project->id}/audio.wav");
        $result = $stt->transcribe($wav, [
            'out_prefix' => storage_path("app/projects/{$project->id}/whisper"),
        ]);

        $confs = array_filter(array_column($result->words, 'conf'), fn ($c) => $c !== null);
        Transcript::updateOrCreate(
            ['project_id' => $project->id],
            [
                'model' => $result->model,
                'lang' => $result->language,
                'full_text' => $result->fullText(),
                'words_json' => json_encode($result->words),
                'segments_json' => json_encode($result->segments),
                'conf_avg' => $confs === [] ? null : round(array_sum($confs) / count($confs), 3),
                'status' => 'done',
            ]
        );
        $project->update(['status' => 'transcribed']);
    }

    public function failed(Throwable $e): void
    {
        Project::whereKey($this->projectId)->update([
            'status' => 'failed',
            'error' => mb_substr($e->getMessage(), 0, 500),
        ]);
    }
}
