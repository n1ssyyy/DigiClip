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
}
