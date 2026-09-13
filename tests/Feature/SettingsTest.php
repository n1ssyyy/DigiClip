<?php

namespace Tests\Feature;

use App\Models\Setting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_page_renders_with_defaults(): void
    {
        $this->get('/settings')->assertOk();
    }

    public function test_saves_settings_and_encrypts_key(): void
    {
        $this->put('/settings', [
            'openrouter_key' => 'sk-or-test123',
            'openrouter_model' => 'openai/gpt-4o-mini',
            'stt_model' => 'tiny.en',
            'stt_gpu' => true,
            'clips_count' => 5,
            'caption_default' => 'hormozi',
        ])->assertRedirect();

        $this->assertSame('openai/gpt-4o-mini', Setting::get('openrouter_model'));
        $this->assertSame('5', Setting::get('clips_count'));
        // At rest the value must not be plaintext.
        $raw = \DB::table('settings')->where('key', 'openrouter_key')->value('value');
        $this->assertStringNotContainsString('sk-or-test123', $raw);
        $this->assertSame('sk-or-test123', Setting::get('openrouter_key'));
    }

    public function test_empty_key_keeps_existing(): void
    {
        Setting::set('openrouter_key', 'original');

        $this->put('/settings', [
            'openrouter_key' => '',
            'openrouter_model' => 'meta/muse-spark-1.3',
            'stt_model' => 'base.en',
            'stt_gpu' => false,
            'clips_count' => 3,
            'caption_default' => 'tiktok',
        ])->assertRedirect();

        $this->assertSame('original', Setting::get('openrouter_key'));
    }

    public function test_usage_cost_math(): void
    {
        // Muse Spark 1.3: $1.25/M in, $4.25/M out → 1000+500 tokens ≈ $0.003375 → 0¢ rounded? use bigger numbers.
        $cents = \App\Services\Clips\OpenRouterClient::costCents('meta/muse-spark-1.3', 8000, 2000);

        $this->assertSame(2, $cents); // 8000*1.25e-6*100=1.0 + 2000*4.25e-6*100=0.85 → 1.85 → 2
    }
}
