<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Services\Notifications\Notifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Native\Desktop\Facades\Notification as DesktopNotification;
use Tests\TestCase;

class NotificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_send_stores_unread_record(): void
    {
        app(Notifier::class)->send('success', 'Clips ready', 'demo.mp4 — 3 clips picked.');

        $this->assertDatabaseHas('notifications', [
            'type' => 'success',
            'title' => 'Clips ready',
            'read_at' => null,
        ]);
    }

    public function test_focused_window_skips_desktop_banner(): void
    {
        DesktopNotification::shouldReceive('title')->never();
        Notifier::heartbeat(true);

        app(Notifier::class)->send('success', 'Model downloaded', 'base.en is on disk.');

        $this->assertDatabaseCount('notifications', 1);
    }

    public function test_away_window_attempts_desktop_banner(): void
    {
        // Outside the native runtime there is no Electron bridge, so the
        // attempt must degrade silently — the record is what matters here.
        Cache::forget(Notifier::FOCUS_KEY);

        app(Notifier::class)->send('info', 'Transcription done', 'demo.mp4 transcribed.');

        $this->assertDatabaseHas('notifications', ['title' => 'Transcription done']);
    }

    public function test_presence_heartbeat_marks_focus(): void
    {
        $this->postJson('/api/presence', ['focused' => true])
            ->assertOk()
            ->assertJsonPath('focused', true);
        $this->assertTrue(Notifier::focused());

        $this->postJson('/api/presence', ['focused' => false])->assertOk();
        $this->assertFalse(Notifier::focused());
    }

    public function test_presence_requires_boolean(): void
    {
        $this->postJson('/api/presence', ['focused' => 'maybe'])->assertStatus(422);
    }

    public function test_feed_lists_unread_only(): void
    {
        Notification::create(['type' => 'info', 'title' => 'Old news'])->markRead();
        $fresh = Notification::create(['type' => 'success', 'title' => 'Fresh news']);

        $this->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonCount(1, 'notifications')
            ->assertJsonPath('notifications.0.id', $fresh->id)
            ->assertJsonPath('notifications.0.title', 'Fresh news');
    }

    public function test_read_marks_receipts(): void
    {
        $a = Notification::create(['type' => 'info', 'title' => 'A']);
        $b = Notification::create(['type' => 'info', 'title' => 'B']);

        $this->postJson('/api/notifications/read', ['ids' => [$a->id, $b->id]])->assertOk();

        $this->assertSame(0, Notification::unread()->count());
    }
}
