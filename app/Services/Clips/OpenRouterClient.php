<?php

namespace App\Services\Clips;

use App\Models\Setting;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * OpenRouter Chat Completions. BYOK; default model
 * `nvidia/nemotron-3-ultra-550b-a55b:free`. Strict JSON only.
 */
class OpenRouterClient
{
    public function __construct(
        private ?string $apiKey = null,
        private ?string $model = null,
    ) {
        // Explicit args win, then Settings UI, then .env (config).
        $this->apiKey ??= Setting::get('openrouter_key') ?? (string) config('digiclip.openrouter.key');
        $this->model ??= Setting::get('openrouter_model') ?? (string) config('digiclip.openrouter.model_default', 'nvidia/nemotron-3-ultra-550b-a55b:free');
    }

    public function hasKey(): bool
    {
        return $this->apiKey !== '';
    }

    public function model(): string
    {
        return $this->model;
    }

    /**
     * Live model catalog for the picker (cached 1h). Lean rows only.
     *
     * @return array{id: string, name: string}[]
     */
    public function models(bool $refresh = false): array
    {
        if ($refresh) {
            \Illuminate\Support\Facades\Cache::forget('digiclip:or-models');
        }

        return \Illuminate\Support\Facades\Cache::remember('digiclip:or-models', 3600, function () {
            $base = rtrim((string) config('digiclip.openrouter.base_url'), '/');
            $req = \Illuminate\Support\Facades\Http::baseUrl($base)
                ->timeout(30)
                ->retry(1, 1000, throw: false);
            if ($this->hasKey()) {
                $req = $req->withToken($this->apiKey);
            }
            $res = $req->get('/models');
            if (! $res->successful()) {
                throw new OpenRouterException(
                    'Model list failed '.$res->status().': '.mb_substr($res->body(), 0, 200),
                    $res->status()
                );
            }

            return collect($res->json('data', []))
                ->map(fn ($m) => ['id' => (string) ($m['id'] ?? ''), 'name' => (string) ($m['name'] ?? $m['id'] ?? '')])
                ->filter(fn ($m) => $m['id'] !== '')
                ->sortBy('id')
                ->values()
                ->all();
        });
    }

    /**
     * Rough cost estimate in USD cents (×100) from the pricing map.
     */
    public static function costCents(string $model, int $promptTokens, int $completionTokens): int
    {
        $pricing = config('digiclip.openrouter.pricing', []);
        $p = $pricing[$model] ?? $pricing['default'] ?? ['in' => 0, 'out' => 0];

        return (int) round($promptTokens / 1000000 * $p['in'] * 100 + $completionTokens / 1000000 * $p['out'] * 100);
    }

    /**
     * @return array{clips: array, usage: array{prompt_tokens: int, completion_tokens: int}}
     */
    public function analyze(string $system, string $user, array $options = []): array
    {
        if (! $this->hasKey()) {
            throw new RuntimeException('OpenRouter API key missing. Set OPENROUTER_API_KEY.');
        }
        $base = rtrim((string) config('digiclip.openrouter.base_url'), '/');
        $res = Http::baseUrl($base)
            ->withToken($this->apiKey)
            ->withHeaders(['HTTP-Referer' => 'https://digiclip.app', 'X-Title' => 'DigiClip'])
            ->timeout((int) config('digiclip.openrouter.timeout_s', 90))
            ->retry(2, 2000, throw: false)
            ->post('/chat/completions', [
                'model' => $options['model'] ?? $this->model,
                'temperature' => 0.3,
                'response_format' => ['type' => 'json_object'],
                'messages' => [
                    ['role' => 'system', 'content' => $system],
                    ['role' => 'user', 'content' => $user],
                ],
            ]);

        if (! $res->successful()) {
            throw new OpenRouterException(
                'OpenRouter error '.$res->status().': '.mb_substr($res->body(), 0, 300),
                $res->status()
            );
        }
        $content = $res->json('choices.0.message.content', '');
        $data = json_decode(is_string($content) ? $content : '', true);
        if (! is_array($data)) {
            throw new RuntimeException('OpenRouter returned non-JSON content.');
        }

        return [
            'clips' => $data['clips'] ?? [],
            'usage' => [
                'prompt_tokens' => (int) $res->json('usage.prompt_tokens', 0),
                'completion_tokens' => (int) $res->json('usage.completion_tokens', 0),
            ],
        ];
    }
}
