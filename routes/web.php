<?php

use App\Http\Controllers\HealthController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\RenderController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\TranscriptController;
use App\Http\Controllers\WindowController;
use Illuminate\Support\Facades\Route;

Route::get('/', [ProjectController::class, 'index'])->name('projects.index');
Route::post('/projects', [ProjectController::class, 'store'])->name('projects.store');
Route::get('/projects/{project}/transcript', [TranscriptController::class, 'show'])->name('transcript.show');
Route::get('/projects/{project}/transcript.srt', [TranscriptController::class, 'download'])->name('transcript.srt');
Route::get('/renders/{render}/download', [RenderController::class, 'download'])->name('renders.download');
Route::get('/renders/{render}/stream', [RenderController::class, 'stream'])->name('renders.stream');
Route::get('/renders/{render}/poster', [RenderController::class, 'poster'])->name('renders.poster');
Route::get('/settings', [SettingsController::class, 'edit'])->name('settings.edit');
Route::put('/settings', [SettingsController::class, 'update'])->name('settings.update');
Route::get('/api/openrouter-models', [SettingsController::class, 'models'])->name('api.models');
Route::post('/projects/{project}/retry', [ProjectController::class, 'retry'])->name('projects.retry');
Route::post('/projects/{project}/analyze', [ProjectController::class, 'analyze'])->name('projects.analyze');
Route::post('/projects/{project}/pause', [ProjectController::class, 'pause'])->name('projects.pause');
Route::post('/projects/{project}/resume', [ProjectController::class, 'resume'])->name('projects.resume');
Route::delete('/projects/{project}', [ProjectController::class, 'destroy'])->name('projects.destroy');
Route::get('/projects/{project}/poster', [ProjectController::class, 'poster'])->name('projects.poster');
Route::get('/projects/{project}/stream', [ProjectController::class, 'stream'])->name('projects.stream');

// TEMP-DEBUG: renderer socket diagnostics. Remove once Echo is stable.
Route::get('/api/echo-debug', function (\Illuminate\Http\Request $request) {
    \Illuminate\Support\Facades\Log::info('echo-debug: '.$request->input('event').' '.mb_substr((string) $request->input('detail'), 0, 300));

    return response()->json(['ok' => true]);
});

Route::get('/health', [HealthController::class, 'index'])->name('health');
Route::get('/api/health', [HealthController::class, 'show'])->name('api.health');
Route::get('/api/snapshot', [HealthController::class, 'snapshot'])->name('api.snapshot');

// Custom frameless titlebar controls (no-op outside the native runtime).
Route::post('/native/window/minimize', [WindowController::class, 'minimize'])->name('native.window.minimize');
Route::post('/native/window/maximize', [WindowController::class, 'maximize'])->name('native.window.maximize');
Route::post('/native/window/unmaximize', [WindowController::class, 'unmaximize'])->name('native.window.unmaximize');
Route::post('/native/window/close', [WindowController::class, 'close'])->name('native.window.close');
