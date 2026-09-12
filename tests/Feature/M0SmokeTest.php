<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class M0SmokeTest extends TestCase
{
    use RefreshDatabase;
    public function test_inbox_renders(): void
    {
        $this->get('/')->assertOk();
    }

    public function test_health_page_renders(): void
    {
        $this->get('/health')->assertOk();
    }

    public function test_health_api_reports_shape(): void
    {
        $this->getJson('/api/health')
            ->assertOk()
            ->assertJsonStructure([
                'php' => ['version', 'ok', 'extensions'],
                'node' => ['ok'],
                'ffmpeg' => ['ok'],
                'whisper' => ['ok'],
                'storage' => ['ok'],
                'database' => ['ok'],
                'queue' => ['connection', 'ok'],
            ]);
    }

    public function test_upload_validation_rejects_empty(): void
    {
        $this->post('/projects', [])->assertSessionHasErrors('video');
    }
}
