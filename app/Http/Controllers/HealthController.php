<?php

namespace App\Http\Controllers;

use App\Services\System\HealthProbe;
use Inertia\Inertia;
use Inertia\Response;

class HealthController extends Controller
{
    public function index(HealthProbe $probe): Response
    {
        return Inertia::render('Health', ['report' => $probe->report()]);
    }

    public function show(HealthProbe $probe)
    {
        return response()->json($probe->report());
    }

    /** Live pipeline counts for the health snapshot strip. */
    public function snapshot()
    {
        $projects = \App\Models\Project::query()
            ->selectRaw('status, COUNT(*) as c')
            ->groupBy('status')
            ->pluck('c', 'status');
        $renders = \App\Models\Render::query()
            ->selectRaw('status, COUNT(*) as c')
            ->groupBy('status')
            ->pluck('c', 'status');

        return response()->json(['projects' => $projects, 'renders' => $renders]);
    }
}
