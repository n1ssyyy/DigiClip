<?php

namespace App\Providers;

use Native\Desktop\Contracts\ProvidesPhpIni;
use Native\Desktop\Facades\ChildProcess;
use Native\Desktop\Facades\Window;

class NativeAppServiceProvider implements ProvidesPhpIni
{
    /**
     * Executed once the native application has been booted.
     * Use this method to open windows, register global shortcuts, etc.
     */
    public function boot(): void
    {
        // NOTE: the packaged-runtime broadcast override (reverb → log) lives
        // in AppServiceProvider, not here: this provider boots once in the
        // Electron main-process context, never in serve workers / queue
        // workers where broadcasts are actually dispatched.

        Window::open()
            ->title('DigiClip')
            // Custom chrome: OS frame removed, the app header (Titlebar)
            // acts as titlebar with window buttons on the right.
            ->frameless()
            // Transparent shell so CSS border-radius gives rounded corners
            // (#app paints the actual background; see app.css).
            ->transparent()
            // Never auto-open devtools (explicit false beats the
            // `config('app.debug')` default and the dev-mode opener).
            ->showDevTools(false)
            ->hideMenu()
            ->width(1280)
            ->height(800)
            ->minWidth(1100)
            ->minHeight(700)
            ->rememberState();

        $this->ensureReverb();
        $this->ensureDatabase();
    }

    /**
     * The realtime socket (Reverb) must run for event-based UI updates.
     * No-op outside the native runtime: without the Electron API bridge
     * these calls fail fast and are ignored (dev runs reverb:start manually).
     * Also skipped when pcntl is unavailable: Reverb's server subscribes to
     * process signals (SIGINT) and fatals without the pcntl extension —
     * which is exactly the case for the bundled static PHP in installers.
     */
    private function ensureReverb(): void
    {
        try {
            if (! function_exists('pcntl_signal')) {
                return;
            }
            if (ChildProcess::get('reverb')) {
                return;
            }
            ChildProcess::php(
                'artisan reverb:start --host=127.0.0.1 --port=8080',
                'reverb',
                persistent: true,
            );
        } catch (\Throwable) {
        }
    }

    /**
     * Zero-setup first launch: the packaged app keeps SQLite in the
     * user-writable data dir (NativePHP `rewriteDatabase`), but nothing
     * creates the file or its tables out of the box. Touch + migrate here
     * (idempotent, ~ms when already current). Runs in the native runtime
     * only (main process, queue workers, php children all boot this
     * provider); never break boot over it — HealthProbe reports DB state.
     */
    private function ensureDatabase(): void
    {
        try {
            if (! config('nativephp-internal.running')) {
                return;
            }
            $path = config('nativephp-internal.database_path');
            if (! is_string($path) || $path === '') {
                return;
            }
            if (! is_file($path)) {
                @mkdir(dirname($path), 0755, true);
                @touch($path);
            }
            \Illuminate\Support\Facades\Artisan::call('native:migrate', ['--force' => true]);
        } catch (\Throwable) {
        }
    }

    /**
     * Return an array of php.ini directives to be set.
     */
    public function phpIni(): array
    {
        return [
            // Video uploads (up to 500MB in dev; chunked uploads in V2)
            'upload_max_filesize' => '512M',
            'post_max_size' => '512M',
            'max_execution_time' => 0,
            'memory_limit' => '1024M',
        ];
    }
}
