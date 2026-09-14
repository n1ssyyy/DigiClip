<?php

namespace App\Http\Controllers;

use App\Jobs\AnalyzeClipsJob;
use App\Jobs\ExtractAudioJob;
use App\Jobs\TranscribeJob;
use App\Models\Project;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Bus;
use Inertia\Inertia;
use Inertia\Response;

class ProjectController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('Home', [
            'projects' => Project::latest()->take(20)->with([
                'clipCandidates:id,project_id,rank,title,status,start_s,end_s',
                'clipCandidates.renders:id,clip_candidate_id,status',
            ])->get([
                'id', 'name', 'status', 'error', 'duration_s', 'size_bytes', 'created_at',
            ]),
            'limits' => [
                'max_mb' => (int) (config('digiclip.upload_max_mb')),
                'accept' => config('digiclip.accept'),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'video' => ['required', 'file', 'mimetypes:video/mp4,video/quicktime,video/x-matroska,video/webm,video/mp4v-es,audio/mp4', 'max:'.config('digiclip.upload_max_kb')],
        ]);

        $file = $data['video'];
        $path = $file->store('projects-sources', 'local');

        $project = Project::create([
            'name' => pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME),
            'source_path' => $path,
            'mime' => $file->getMimeType(),
            'size_bytes' => $file->getSize(),
            'status' => 'queued',
        ]);

        Bus::chain([
            (new ExtractAudioJob($project->id))->onQueue('transcribe'),
            (new TranscribeJob($project->id))->onQueue('transcribe'),
            (new AnalyzeClipsJob($project->id))->onQueue('default'),
        ])->dispatch();

        return redirect()->route('projects.index')->with('flash', "Stored {$project->name}, transcription queued.");
    }

    /** Re-run only clip analysis (cheap, no re-transcribe). */
    public function analyze(Project $project)
    {
        Bus::dispatch((new AnalyzeClipsJob($project->id))->onQueue('default'));

        return back()->with('flash', "Re-analyzing {$project->name} for clips.");
    }

    /** Re-run the full chain (extract → transcribe → analyze) after a failure. */
    public function retry(Project $project)
    {
        self::dispatchFromStep($project);
        $project->refresh();

        return back()->with('flash', "Re-queued {$project->name}.");
    }

    /**
     * Smart retry: resume from the latest finished step instead of the
     * top. Extract is cheap but pointless when audio.wav + probe data
     * already exist; transcription is the expensive one and is skipped
     * when a transcript row is stored. Anything else re-runs fully.
     */
    public static function dispatchFromStep(Project $project): void
    {
        $jobs = [];
        $wav = storage_path("app/projects/{$project->id}/audio.wav");
        if (! is_file($wav) || $project->duration_s === null) {
            $jobs[] = (new ExtractAudioJob($project->id))->onQueue('transcribe');
        }
        if (! $project->transcript()->exists()) {
            $jobs[] = (new TranscribeJob($project->id))->onQueue('transcribe');
        }
        $jobs[] = (new AnalyzeClipsJob($project->id))->onQueue('default');

        $project->update(['status' => 'queued', 'error' => null]);
        Bus::chain($jobs)->dispatch();
    }

    /** Pause queued/future pipeline steps. A step already running finishes its
     *  current unit of work; the next job in the chain then exits quietly. */
    public function pause(Project $project)
    {
        if (in_array($project->status, ['queued', 'extracting', 'extracted', 'transcribing', 'transcribed', 'analyzing'], true)) {
            $project->update(['status' => 'paused']);
        }

        return back()->with('flash', "Paused {$project->name}.");
    }

    /** Resume a paused project from the latest finished step. Queued
     *  leftovers from before the pause are purged first: without this the
     *  old chain (still waiting behind a long transcription) would fire
     *  right after resume and re-run work from the top. */
    public function resume(Project $project)
    {
        if ($project->status === 'paused') {
            self::purgeProjectJobs($project->id);
            self::dispatchFromStep($project);
            $project->refresh();
        }

        return back()->with('flash', "Resumed {$project->name}.");
    }

    /** Drop this project's still-waiting jobs so pause/resume/delete
     *  can't resurrect stale chain steps. The currently-reserved
     *  (running) job is untouched — it exits on its own via the
     *  paused/missing guards. */
    public static function purgeProjectJobs(int $projectId): void
    {
        $db = \Illuminate\Support\Facades\DB::connection(
            config('queue.connections.database.connection')
        );
        foreach ($db->table(config('queue.connections.database.table', 'jobs'))->whereNull('reserved_at')->get() as $row) {
            try {
                $payload = json_decode($row->payload, true);
                $command = @unserialize($payload['data']['command'] ?? '');
                if ($command instanceof ExtractAudioJob
                    || $command instanceof TranscribeJob
                    || $command instanceof AnalyzeClipsJob) {
                    if ($command->projectId === $projectId) {
                        $db->table(config('queue.connections.database.table', 'jobs'))->whereKey($row->id)->delete();
                    }
                }
            } catch (\Throwable) {
            }
        }
    }

    /** Cancel completely: drop the source file, work dir, and the row.
     *  Chain jobs still queued exit quietly via the missing-project guard. */
    public function destroy(Project $project)
    {
        $id = $project->id;
        self::purgeProjectJobs($id);
        if ($project->source_path) {
            \Illuminate\Support\Facades\Storage::disk('local')->delete($project->source_path);
        }
        \Illuminate\Support\Facades\File::deleteDirectory(storage_path("app/projects/{$id}"));
        $name = $project->name;
        $project->transcript()->delete();
        $project->clipCandidates()->delete();
        $project->delete();

        return redirect()->route('projects.index')->with('flash', "Cancelled and removed {$name}.");
    }

    /** Poster frame: served from disk, generated lazily from the source on
     *  first request (heals projects extracted before posters existed).
     *  404 only when the source itself is gone. */
    public function poster(Project $project, \App\Services\Media\FfmpegService $ffmpeg)
    {
        $path = storage_path("app/projects/{$project->id}/poster.jpg");
        if (! is_file($path)) {
            $source = \Illuminate\Support\Facades\Storage::disk('local')->path($project->source_path);
            if (is_file($source)) {
                $ffmpeg->poster($source, $path);
            }
        }
        if (! is_file($path)) {
            abort(404);
        }

        return response()->file($path, ['Content-Type' => 'image/jpeg']);
    }

    /** Source video stream (range-capable) for in-app thumbnails. */
    public function stream(Project $project)
    {
        $path = \Illuminate\Support\Facades\Storage::disk('local')->path($project->source_path);
        if (! is_file($path)) {
            abort(404);
        }

        return response()->file($path, ['Content-Type' => $project->mime ?: 'video/mp4']);
    }
}
