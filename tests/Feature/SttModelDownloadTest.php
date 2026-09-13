<?php

namespace Tests\Feature;

use App\Jobs\DownloadModelJob;
use App\Services\Stt\ModelManager;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class SttModelDownloadTest extends TestCase
{
    use RefreshDatabase;

    public function test_status_lists_every_known_model(): void
    {
        $res = $this->getJson('/api/stt-models')->assertOk();
        $models = $res->json('models');

        // Model ids contain dots — assert in PHP, not via dot paths.
        $this->assertSame(75, $models['tiny.en']['size_mb']);
        $this->assertSame(142, $models['base.en']['size_mb']);
        foreach ($models as $id => $row) {
            $this->assertArrayHasKey('downloaded', $row, $id);
            $this->assertArrayHasKey('downloading', $row, $id);
            $this->assertArrayHasKey('progress', $row, $id);
            $this->assertArrayHasKey('failed', $row, $id);
            $this->assertArrayHasKey('error', $row, $id);
        }
    }

    public function test_unknown_model_delete_is_404(): void
    {
        $this->deleteJson('/api/stt-models/nope-not-a-model')->assertNotFound();
    }

    public function test_delete_removes_weights_and_resume_state(): void
    {
        $models = app(ModelManager::class);
        $file = $models->fileFor('tiny.en');
        $part = $models->partPath('tiny.en');
        if ((is_file($file) && filesize($file) > 1024 * 1024) || is_file($part) && filesize($part) > 1024 * 1024) {
            $this->markTestSkipped('Real model weights present; refusing to touch them.');
        }
        @mkdir(dirname($file), 0755, true);
        file_put_contents($file, 'fake-weights');
        file_put_contents($part, 'fake-part');

        $this->deleteJson('/api/stt-models/tiny.en')
            ->assertOk()
            ->assertJsonPath('status', 'deleted');

        $this->assertFileDoesNotExist($file);
        $this->assertFileDoesNotExist($part);
    }

    public function test_delete_missing_model_is_idempotent(): void
    {
        $this->mock(ModelManager::class, function ($m) {
            $m->shouldReceive('deleteModel')->with('large-v3')->andReturn(false);
        });

        $this->deleteJson('/api/stt-models/large-v3')
            ->assertOk()
            ->assertJsonPath('status', 'not-downloaded');
    }

    public function test_already_downloaded_model_is_not_queued(): void
    {
        Bus::fake();
        $this->mock(ModelManager::class, function ($m) {
            $m->shouldReceive('downloadState')->with('base.en')->andReturn([
                'status' => 'downloaded', 'progress' => 100, 'error' => null,
            ]);
        });

        $this->postJson('/api/stt-models/base.en/download')
            ->assertOk()
            ->assertJsonPath('status', 'downloaded');
        Bus::assertNothingDispatched();
    }

    public function test_missing_model_queues_background_job(): void
    {
        Bus::fake();
        $this->mock(ModelManager::class, function ($m) {
            $m->shouldReceive('downloadState')->with('large-v3-turbo')->andReturn([
                'status' => 'missing', 'progress' => null, 'error' => null,
            ]);
        });

        $this->postJson('/api/stt-models/large-v3-turbo/download')
            ->assertStatus(202)
            ->assertJsonPath('status', 'queued');
        Bus::assertDispatched(DownloadModelJob::class, fn ($job) => $job->model === 'large-v3-turbo');
    }

    public function test_active_download_reports_instead_of_requeueing(): void
    {
        Bus::fake();
        $this->mock(ModelManager::class, function ($m) {
            $m->shouldReceive('downloadState')->with('tiny.en')->andReturn([
                'status' => 'downloading', 'progress' => 42, 'error' => null,
            ]);
        });

        $this->postJson('/api/stt-models/tiny.en/download')
            ->assertStatus(202)
            ->assertJsonPath('status', 'downloading')
            ->assertJsonPath('progress', 42);
        Bus::assertNothingDispatched();
    }

    public function test_job_success_notifies_and_clears_progress(): void
    {
        $models = $this->mock(ModelManager::class, function ($m) {
            $m->shouldReceive('isDownloaded')->with('tiny.en')->andReturn(false);
            $m->shouldReceive('download')->with('tiny.en', \Mockery::type('callable'))->andReturnUsing(
                function ($model, $cb) {
                    $cb(100);

                    return $model;
                }
            );
        });

        (new DownloadModelJob('tiny.en'))->handle($models, app(\App\Services\Notifications\Notifier::class));

        $this->assertNull(Cache::get(ModelManager::downloadProgressKey('tiny.en')));
        $this->assertDatabaseHas('notifications', [
            'type' => 'success',
            'title' => 'Model downloaded',
        ]);
    }

    public function test_job_failure_parks_retryable_state_and_notifies(): void
    {
        $models = $this->mock(ModelManager::class, function ($m) {
            $m->shouldReceive('isDownloaded')->with('tiny.en')->andReturn(false);
            $m->shouldReceive('download')->andThrow(new \RuntimeException('boom'));
        });

        (new DownloadModelJob('tiny.en'))->handle($models, app(\App\Services\Notifications\Notifier::class));

        $this->assertSame('failed', Cache::get(ModelManager::downloadProgressKey('tiny.en'))['status']);
        $this->assertDatabaseHas('notifications', [
            'type' => 'error',
            'title' => 'Model download failed',
        ]);
    }
}
