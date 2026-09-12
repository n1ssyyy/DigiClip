<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OpenExternalTest extends TestCase
{
    use RefreshDatabase;

    public function test_https_link_is_accepted(): void
    {
        $this->postJson('/api/open-external', ['url' => 'https://github.com/n1ssyyy/DigiClip'])
            ->assertOk()
            ->assertJsonPath('ok', true);
    }

    public function test_non_http_scheme_is_rejected(): void
    {
        $this->postJson('/api/open-external', ['url' => 'shell:open-stuff'])
            ->assertStatus(422);
    }
}
