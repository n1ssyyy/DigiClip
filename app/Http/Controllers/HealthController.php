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
}
