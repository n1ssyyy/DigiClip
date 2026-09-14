<?php

namespace App\Http\Controllers;

use App\Models\Render;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class RenderController extends Controller
{
    public function download(Render $render)
    {
        $abs = $render->mp4Absolute();
        abort_unless($abs && is_file($abs), 404);

        return response()->download($abs, "digiclip-clip{$render->clip_candidate_id}-9x16.mp4");
    }

    /** Inline stream for the in-app player (supports range requests for seeking). */
    public function stream(Render $render, Request $request)
    {
        $abs = $render->mp4Absolute();
        abort_unless($abs && is_file($abs), 404);

        $fileSize = filesize($abs);
        $mimeType = 'video/mp4';

        // Handle range requests for video seeking
        $range = $request->header('Range');
        if ($range) {
            // Parse range header: bytes=start-end
            $range = str_replace('bytes=', '', $range);
            [$start, $end] = explode('-', $range);
            $start = (int) $start;
            $end = $end !== '' ? (int) $end : $fileSize - 1;
            $end = min($end, $fileSize - 1);
            $length = $end - $start + 1;

            $response = new Response();
            $response->headers->set('Content-Type', $mimeType);
            $response->headers->set('Content-Length', (string) $length);
            $response->headers->set('Content-Range', "bytes {$start}-{$end}/{$fileSize}");
            $response->headers->set('Accept-Ranges', 'bytes');
            $response->headers->set('Cache-Control', 'public, max-age=3600');
            $response->setStatusCode(206); // Partial Content

            $response->setCallback(function () use ($abs, $start, $length) {
                $handle = fopen($abs, 'rb');
                fseek($handle, $start);
                echo fread($handle, $length);
                fclose($handle);
            });

            return $response;
        }

        // Full file response
        return response()->file($abs, [
            'Content-Type' => $mimeType,
            'Accept-Ranges' => 'bytes',
            'Content-Length' => (string) $fileSize,
            'Cache-Control' => 'public, max-age=3600',
        ]);
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
