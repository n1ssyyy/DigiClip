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
        $project->update(['status' => 'queued', 'error' => null]);
        Bus::chain([
            (new ExtractAudioJob($project->id))->onQueue('transcribe'),
            (new TranscribeJob($project->id))->onQueue('transcribe'),
            (new AnalyzeClipsJob($project->id))->onQueue('default'),
        ])->dispatch();

        return back()->with('flash', "Re-queued {$project->name}.");
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

    /** Resume a paused project by re-dispatching the full chain. */
    public function resume(Project $project)
    {
        if ($project->status === 'paused') {
            $project->update(['status' => 'queued', 'error' => null]);
            Bus::chain([
                (new ExtractAudioJob($project->id))->onQueue('transcribe'),
                (new TranscribeJob($project->id))->onQueue('transcribe'),
                (new AnalyzeClipsJob($project->id))->onQueue('default'),
            ])->dispatch();
        }

        return back()->with('flash', "Resumed {$project->name}.");
    }

    /** Cancel completely: drop the source file, work dir, and the row.
     *  Chain jobs still queued exit quietly via the missing-project guard. */
    public function destroy(Project $project)
    {
        if ($project->source_path) {
            \Illuminate\Support\Facades\Storage::disk('local')->delete($project->source_path);
        }
        \Illuminate\Support\Facades\File::deleteDirectory(storage_path("app/projects/{$project->id}"));
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
