<?php

namespace App\Jobs;

use App\Models\Project;
use App\Models\Transcript;
use App\Services\Notifications\Notifier;
use App\Services\Stt\WhisperCppTranscriber;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

class TranscribeJob implements ShouldQueue
{
    use Queueable;

    // Worker-level kill switch: keep at the max tier so the worker never
    // SIGKILLs a healthy run before the per-model Process timeout fires
    // (a worker kill re-reserves the job, which then dies as
    // "attempted too many times"). The real budget is enforced per-model
    // inside handle() via the transcribe() timeout option.
    public int $timeout = 14400;

    // Queue re-reservation guard: default retry_after=90s would re-reserve
    // a running TranscribeJob (takes 5-60+ min). Override per-job so the
    // job stays reserved until it finishes or the worker timeout fires.
    public int $retryAfter = 15000;

    public int $tries = 1;

    public function __construct(public int $projectId) {}

    /** Seconds a model gets on CPU: bigger weights need hours, not minutes. */
    public static function timeoutForModel(?string $modelId): int
    {
        $mb = (int) (config('digiclip.stt.models', [])[$modelId ?? '']['size_mb'] ?? 0);

        return $mb <= 0 ? 1800 : ($mb <= 150 ? 1800 : ($mb <= 700 ? 7200 : 14400));
    }

    public function handle(WhisperCppTranscriber $stt, Notifier $notify): void
    {
        $project = Project::find($this->projectId);
        // Cancelled mid-queue, or paused: exit quietly so the chain drains.
        if (! $project || $project->status === 'paused') {
            return;
        }
        $project->update(['status' => 'transcribing', 'error' => null]);

        $wav = storage_path("app/projects/{$project->id}/audio.wav");
        // Resolve the budget from the model actually in use (not the value
        // at dispatch time — the user may have switched models since).
        $timeout = self::timeoutForModel($stt->modelId());
        $result = $stt->transcribe($wav, [
            'out_prefix' => storage_path("app/projects/{$project->id}/whisper"),
            'timeout' => $timeout,
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
        $notify->send('success', 'Transcription done', "{$project->name} transcribed — finding clips.", ['project_id' => $project->id]);
    }

    public function failed(Throwable $e): void
    {
        $project = Project::find($this->projectId);
        $error = str_contains($e->getMessage(), 'attempted too many times')
            ? 'Transcription ran too long and was stopped. Use base.en, a shorter video, or turn on GPU transcription in Settings.'
            : mb_substr($e->getMessage(), 0, 500);
        $project?->update(['status' => 'failed', 'error' => $error]);
        app(Notifier::class)->send('error', 'Transcription failed', ($project ? "{$project->name} — " : '').mb_substr($error, 0, 160), $project ? ['project_id' => $project->id] : []);
    }
}
