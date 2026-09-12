<?php

namespace App\Http\Controllers;

use App\Models\Setting;
use App\Services\Clips\OpenRouterClient;
use App\Services\Stt\ModelManager;
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

    public function edit(ModelManager $models): Response
    {
        return Inertia::render('Settings', [
            'settings' => [
                'openrouter_key_set' => (bool) (Setting::get('openrouter_key') ?? config('digiclip.openrouter.key')),
                'openrouter_model' => Setting::get('openrouter_model') ?? config('digiclip.openrouter.model_default'),
                'stt_model' => Setting::get('stt_model') ?? config('digiclip.stt.default_model'),
                'stt_models' => config('digiclip.stt.models', []),
                'stt_downloaded' => collect(array_keys(config('digiclip.stt.models', [])))
                    ->mapWithKeys(fn ($id) => [$id => $models->isDownloaded($id)])
                    ->all(),
                'clips_count' => (int) (Setting::get('clips_count') ?? config('digiclip.clips.count_default', 3)),
                'caption_default' => Setting::get('caption_default') ?? 'tiktok',
            ],
            'model_presets' => self::MODELS,
        ]);
    }

    public function update(Request $request)    {
        $data = $request->validate([
            'openrouter_key' => ['nullable', 'string', 'max:200'],
            'openrouter_model' => ['required', 'string', 'max:120'],
            'stt_model' => ['required', 'string', 'max:40'],
            'clips_count' => ['required', 'integer', 'min:1', 'max:10'],
            'caption_default' => ['required', 'in:tiktok,karaoke,hormozi,minimal,beast,neon,highlight,ghost'],
        ]);

        // Empty key field = keep existing (never echo the secret back).
        if (($data['openrouter_key'] ?? '') !== '') {
            Setting::set('openrouter_key', $data['openrouter_key']);
        }
        Setting::set('openrouter_model', $data['openrouter_model']);
        Setting::set('stt_model', $data['stt_model']);
        Setting::set('clips_count', (string) $data['clips_count']);
        Setting::set('caption_default', $data['caption_default']);

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
