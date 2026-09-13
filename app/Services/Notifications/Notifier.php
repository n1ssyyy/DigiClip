<?php

namespace App\Services\Notifications;

use App\Models\Notification as AppNotification;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Native\Desktop\Facades\Notification as DesktopNotification;

/**
 * Single place to tell the user that a background task finished.
 *
 * Routing rule: the app window knows whether it is focused and reports
 * that via POST /api/presence (AppLayout heartbeat). When the window was
 * seen recently the notification stays in-app (the Toasts host picks it
 * up from /api/notifications); otherwise it goes to the OS as a desktop
 * notification so it is seen even with the window behind other apps.
 */
class Notifier
{
    public const FOCUS_KEY = 'digiclip:window-focused-at';

    /** Heartbeat interval is 20s; treat anything older as away. */
    public const FRESH_S = 45;

    public const HEARTBEAT_TTL_S = 90;

    public function send(string $type, string $title, ?string $body = null, array $data = []): AppNotification
    {
        $notification = AppNotification::create([
            'type' => $type,
            'title' => $title,
            'body' => $body,
            'data' => $data === [] ? null : $data,
        ]);

        if (! static::focused()) {
            $this->desktop($title, $body);
        }

        return $notification;
    }

    public static function focused(): bool
    {
        $at = Cache::get(static::FOCUS_KEY);
        if (! $at) {
            return false;
        }
        try {
            return CarbonImmutable::parse($at)->diffInSeconds(now()) < static::FRESH_S;
        } catch (\Throwable) {
            return false;
        }
    }

    public static function heartbeat(bool $focused): void
    {
        if ($focused) {
            Cache::put(static::FOCUS_KEY, now()->toIso8601String(), static::HEARTBEAT_TTL_S);
        } else {
            Cache::forget(static::FOCUS_KEY);
        }
    }

    /**
     * OS-level banner. Never breaks the caller: outside the native runtime
     * there is no Electron bridge to post to, and a notification must never
     * fail the job that earned it.
     */
    public function desktop(string $title, ?string $body = null): void
    {
        try {
            if (! config('nativephp-internal.running')) {
                return;
            }
            DesktopNotification::title($title)->message($body ?? '')->show();
        } catch (\Throwable) {
        }
    }
}
