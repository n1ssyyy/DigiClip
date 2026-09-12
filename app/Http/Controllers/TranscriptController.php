<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Services\Captions\SrtBuilder;

class TranscriptController extends Controller
{
    public function show(Project $project)
    {
        $t = $project->transcript;
        abort_unless($t, 404, 'No transcript yet — transcription is queued or failed.');

        return response()->json([
            'model' => $t->model,
            'lang' => $t->lang,
            'conf_avg' => $t->conf_avg,
            'status' => $t->status,
            'words' => $t->words(),
            'segments' => json_decode($t->segments_json ?? '[]', true),
        ]);
    }

    public function download(Project $project, SrtBuilder $srt)
    {
        $t = $project->transcript;
        abort_unless($t, 404);

        return response($srt->fromWords($t->words()), 200, [
            'Content-Type' => 'text/plain; charset=utf-8',
            'Content-Disposition' => "attachment; filename=\"{$project->id}-transcript.srt\"",
        ]);
    }
}
