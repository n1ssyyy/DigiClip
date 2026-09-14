<?php

namespace Tests\Feature;

use App\Services\Clips\OpenRouterClient;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class OpenRouterClientTest extends TestCase
{
    public function test_parses_clips_and_usage(): void
    {
        config(['digiclip.openrouter.key' => 'test-key']);
        Http::fake([
            '*' => Http::response([
                'choices' => [[
                    'message' => [
                        'role' => 'assistant',
                        'content' => null,
                        'tool_calls' => [[
                            'id' => 'call_test123',
                            'type' => 'function',
                            'function' => [
                                'name' => 'submit_clips',
                                'arguments' => json_encode(['clips' => [
                                    ['start_s' => 1.0, 'end_s' => 30.0, 'hook_line' => 'Hook'],
                                ]]),
                            ],
                        ]],
                    ],
                ]],
                'usage' => ['prompt_tokens' => 100, 'completion_tokens' => 20],
            ], 200),
        ]);

        $res = (new OpenRouterClient)->analyze('sys', 'user');

        $this->assertCount(1, $res['clips']);
        $this->assertSame(100, $res['usage']['prompt_tokens']);
        Http::assertSent(fn ($req) => $req->url() === 'https://openrouter.ai/api/v1/chat/completions'
            && isset($req->data()['tools'])
            && $req->data()['tools'][0]['function']['name'] === 'submit_clips');
    }

    public function test_requires_key(): void
    {
        config(['digiclip.openrouter.key' => null]);

        $this->expectException(\RuntimeException::class);
        (new OpenRouterClient)->analyze('sys', 'user');
    }

    public function test_rejects_non_json(): void
    {
        config(['digiclip.openrouter.key' => 'test-key']);
        Http::fake(['*' => Http::response([
            'choices' => [['message' => ['content' => 'not json', 'tool_calls' => null]]],
            'usage' => [],
        ], 200)]);

        $this->expectException(\RuntimeException::class);
        (new OpenRouterClient)->analyze('sys', 'user');
    }

    public function test_falls_back_to_content_json(): void
    {
        config(['digiclip.openrouter.key' => 'test-key']);
        Http::fake(['*' => Http::response([
            'choices' => [[
                'message' => [
                    'content' => json_encode(['clips' => [
                        ['start_s' => 5.0, 'end_s' => 25.0, 'hook_line' => 'Fallback'],
                    ]]),
                    'tool_calls' => null,
                ],
            ]],
            'usage' => ['prompt_tokens' => 50, 'completion_tokens' => 10],
        ], 200)]);

        $res = (new OpenRouterClient)->analyze('sys', 'user');

        $this->assertCount(1, $res['clips']);
        $this->assertSame('Fallback', $res['clips'][0]['hook_line']);
    }

    public function test_extracts_json_from_markdown(): void
    {
        config(['digiclip.openrouter.key' => 'test-key']);
        Http::fake(['*' => Http::response([
            'choices' => [[
                'message' => [
                    'content' => "Here are the clips:\n```json\n".json_encode(['clips' => [['start_s' => 10.0, 'end_s' => 30.0, 'hook_line' => 'Fenced']]])."\n```",
                    'tool_calls' => null,
                ],
            ]],
            'usage' => [],
        ], 200)]);

        $res = (new OpenRouterClient)->analyze('sys', 'user');

        $this->assertCount(1, $res['clips']);
        $this->assertSame('Fenced', $res['clips'][0]['hook_line']);
    }

    public function test_models_endpoint_maps_and_caches(): void
    {
        Http::fake(['*' => Http::response(['data' => [
            ['id' => 'zzz/model', 'name' => 'Zed'],
            ['id' => 'meta/muse-spark-1.3-contributor', 'name' => 'Muse Spark'],
            ['id' => 'x/y:free', 'name' => 'Why Free'],
            ['id' => null, 'name' => 'Nope'],
        ]], 200)]);

        $first = $this->getJson('/api/openrouter-models')->assertOk()->json('models');

        $this->assertSame(
            ['meta/muse-spark-1.3-contributor', 'x/y:free', 'zzz/model'],
            array_column($first, 'id')
        );
        // Cached: second hit makes no new HTTP call.
        $this->getJson('/api/openrouter-models')->assertOk();
        Http::assertSentCount(1);
        // Refresh busts the cache.
        $this->getJson('/api/openrouter-models?refresh=1')->assertOk();
        Http::assertSentCount(2);
    }

    public function test_models_endpoint_surfaces_provider_errors(): void
    {
        Http::fake(['*' => Http::response('nope', 500)]);

        $this->getJson('/api/openrouter-models?refresh=1')->assertStatus(500);
    }
}
