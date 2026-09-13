<?php

namespace App\Http\Controllers;

use App\Models\Setting;
use App\Services\Clips\OpenRouterClient;
use App\Services\Stt\ModelManager;
use App\Services\System\GpuDetector;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class SettingsController extends Controller
{
    public const MODELS = [
        'nvidia/nemotron-3-ultra-550b-a55b:free',
        'meta/muse-spark-1.3',
        'openai/gpt-4o-mini',
        'anthropic/claude-3.5-sonnet',
        'google/gemini-2.0-flash',
    ];

    public function edit(ModelManager $models, GpuDetector $gpu, \App\Services\Stt\BinaryManager $binaries): Response
    {
        // The toggle is honest: ON requires real hardware AND a shipped
        // Vulkan sidecar for this platform (macOS has none yet → disabled
        // with the reason, never a silent CPU run pretending to be GPU).
        $vulkan = $binaries->resolve('whisper-cli-vulkan');
        $gpuAvailable = $gpu->available() && $vulkan !== null;
        $gpuReason = $gpuAvailable
            ? null
            : ($vulkan === null && $gpu->available()
                ? 'GPU found, but no accelerated build is installed for this system — CPU transcription only.'
                : 'No compatible GPU detected — CPU transcription only.');

        // Guard against DecryptException if APP_KEY rotated: fall back to
        // config/env so the page never 500s. The pinning logic in
        // AppServiceProvider should prevent this, but belt-and-suspenders.
        $openRouterKeySet = false;
        $openRouterModel = config('digiclip.openrouter.model_default', 'nvidia/nemotron-3-ultra-550b-a55b:free');
        $sttModel = config('digiclip.stt.default_model', 'base.en');
        $sttGpu = '0';
        $clipsCount = config('digiclip.clips.count_default', 3);
        $captionDefault = 'tiktok';

        try {
            $openRouterKeySet = (bool) (Setting::get('openrouter_key') ?? config('digiclip.openrouter.key'));
            $openRouterModel = Setting::get('openrouter_model') ?? $openRouterModel;
            $sttModel = Setting::get('stt_model') ?? $sttModel;
            $sttGpu = Setting::get('stt_gpu') ?? '0';
            $clipsCount = (int) (Setting::get('clips_count') ?? config('digiclip.clips.count_default', 3));
            $captionDefault = Setting::get('caption_default') ?? 'tiktok';
        } catch (\Throwable) {
            // Keep defaults if any Setting::get throws (e.g., rotated APP_KEY).
        }

        return Inertia::render('Settings', [
            'settings' => [
                'openrouter_key_set' => $openRouterKeySet,
                'openrouter_model' => $openRouterModel,
                'stt_model' => $sttModel,
                'stt_models' => config('digiclip.stt.models', []),
                'stt_downloaded' => collect(array_keys(config('digiclip.stt.models', [])))
                    ->mapWithKeys(fn ($id) => [$id => $models->isDownloaded($id)])
                    ->all(),
                'stt_gpu' => $gpuAvailable && $gpu->enabled($sttGpu),
                'gpu' => [
                    'available' => $gpuAvailable,
                    'reason' => $gpuReason,
                    'best' => $gpu->best(),
                    'devices' => $gpu->detect(),
                ],
                'clips_count' => $clipsCount,
                'caption_default' => $captionDefault,
            ],
            'model_presets' => self::MODELS,
        ]);
    }

    public function update(Request $request)    {
        $data = $request->validate([
            'openrouter_key' => ['nullable', 'string', 'max:200'],
            'openrouter_model' => ['required', 'string', 'max:120'],
            'stt_model' => ['required', 'string', 'max:40'],
            'stt_gpu' => ['required', 'boolean'],
            'clips_count' => ['required', 'integer', 'min:1', 'max:10'],
            'caption_default' => ['required', 'in:tiktok,karaoke,hormozi,minimal,beast,neon,highlight,ghost'],
        ]);

        try {
            // Empty key field = keep existing (never echo the secret back).
            if (($data['openrouter_key'] ?? '') !== '') {
                Setting::set('openrouter_key', $data['openrouter_key']);
            }
            Setting::set('openrouter_model', $data['openrouter_model']);
            Setting::set('stt_model', $data['stt_model']);
            Setting::set('stt_gpu', $data['stt_gpu'] ? '1' : '0');
            Setting::set('clips_count', (string) $data['clips_count']);
            Setting::set('caption_default', $data['caption_default']);
        } catch (\Throwable $e) {
            return back()->with('flash', 'Settings saved, but some values could not be stored: '.mb_substr($e->getMessage(), 0, 160));
        }

        return back()->with('flash', 'Settings saved.');
    }

    /** Live OpenRouter catalog for the model picker (?refresh=1 busts cache). */
    public function models(Request $request, OpenRouterClient $llm)
    {
        try {
            return response()->json([
                'models' => $llm->models($request->boolean('refresh')),
                'cached' => ! $request->boolean('refresh'),
            ]);
        } catch (\App\Services\Clips\OpenRouterException $e) {
            return response()->json(['message' => mb_substr($e->getMessage(), 0, 200)], $e->status ?: 502);
        }
    }
}
