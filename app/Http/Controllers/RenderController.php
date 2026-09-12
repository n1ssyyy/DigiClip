<?php

namespace App\Http\Controllers;

use App\Models\Render;

class RenderController extends Controller
{
    public function download(Render $render)
    {
        $abs = $render->mp4Absolute();
        abort_unless($abs && is_file($abs), 404);

        return response()->download($abs, "digiclip-clip{$render->clip_candidate_id}-9x16.mp4");
    }

    /** Inline stream for the in-app player (download stays attachment). */
    public function stream(Render $render)
    {
        $abs = $render->mp4Absolute();
        abort_unless($abs && is_file($abs), 404);

        return response()->file($abs, ['Content-Type' => 'video/mp4']);
    }

    /** Clip thumbnail: generated lazily next to the mp4 on first request. */
    public function poster(Render $render, \App\Services\Media\FfmpegService $ffmpeg)
    {
        $abs = $render->mp4Absolute();
        if ($abs && is_file($abs)) {
            $poster = dirname($abs).'/poster.jpg';
            if (! is_file($poster)) {
                $ffmpeg->poster($abs, $poster);
            }
            if (is_file($poster)) {
                return response()->file($poster, ['Content-Type' => 'image/jpeg']);
            }
        }

        abort(404);
    }
}
