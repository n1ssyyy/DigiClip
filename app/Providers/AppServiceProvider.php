<?php

namespace App\Providers;

use App\Models\Setting;
use App\Services\Stt\WhisperCppTranscriber;
use Illuminate\Foundation\Console\ServeCommand;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->pinNativeAppKey();

        $this->app->when(WhisperCppTranscriber::class)
            ->needs('$model')
            ->give(fn () => Setting::get('stt_model') ?? config('digiclip.stt.default_model', 'base.en'));
        $this->app->when(WhisperCppTranscriber::class)
            ->needs('$gpu')
            ->give(fn () => app(\App\Services\System\GpuDetector::class)->enabled(Setting::get('stt_gpu')));
        $this->app->when(WhisperCppTranscriber::class)
            ->needs('$gpus')
            ->give(fn () => app(\App\Services\System\GpuDetector::class));
    }

    /**
     * Every installer build ships a freshly generated APP_KEY, so without
     * this, updating the app silently invalidates every encrypted setting
     * (OpenRouter key, model picks) with "The MAC is invalid". Pin the key
     * per machine instead: first boot stores the packaged key in user data,
     * later boots reuse the pinned one. Runs in register() so it applies
     * before any decrypt, in every process (serve, queue, one-shots).
     */
    private function pinNativeAppKey(): void
    {
        try {
            // 1) NativePHP sets these in the main process; queue workers
            //    inherit them only if explicitly passed. Be permissive:
            //    also check the known user-data path directly.
            $isNative = (bool) env('NATIVEPHP_RUNNING', false)
                || config('nativephp-internal.running', false);

            $dir = env('NATIVEPHP_USER_DATA_PATH');
            if (! is_string($dir) || $dir === '' || ! is_dir($dir)) {
                // Fallback: known Linux path for this app (id = com.digiclip.app)
                $user = env('USER') ?: getenv('USER') ?: getenv('LOGNAME') ?: 'nexaura';
                $dir = "/home/{$user}/.config/digiclip";
                if (! is_dir($dir)) {
                    // Last resort: try common locations
                    foreach (['/home/nexaura/.config/digiclip', '/root/.config/digiclip'] as $d) {
                        if (is_dir($d)) {
                            $dir = $d;
                            break;
                        }
                    }
                    if (! is_dir($dir)) {
                        return;
                    }
                }
            }

            $pin = $dir . '/app-key';
            if (is_file($pin)) {
                $key = trim((string) @file_get_contents($pin));
                if (str_starts_with($key, 'base64:')) {
                    config(['app.key' => $key]);
                }
                return;
            }
            $key = (string) config('app.key', '');
            if (! str_starts_with($key, 'base64:')) {
                return;
            }
            @file_put_contents($pin, $key, LOCK_EX);
            @chmod($pin, 0600);
        } catch (\Throwable) {
        }
    }

    public function boot(): void
    {
        // Packaged runtime has no Reverb socket server (the bundled static
        // PHP ships without pcntl, so `reverb:start` cannot run there).
        // Routing broadcast events through the `reverb` driver would throw
        // on every dispatch (Pusher connection refused). Keep them on `log`
        // (no-op) in the native runtime. Dev (plain `artisan serve`) still
        // uses reverb from .env for live Echo updates.
        // NOTE: this must live here, not in NativeAppServiceProvider: that
        // class is NativePHP's one-shot app provider, booted once by the
        // Electron main process — it never runs in `serve` HTTP workers or
        // queue workers, so a broadcast override there has no effect.
        if (config('nativephp-internal.running')) {
            config(['broadcasting.default' => 'log']);
        }

        // User-space toolchain (see README §0): our php needs PHPRC to find
        // its php.ini and LD_LIBRARY_PATH for libzip. `serve` strips all env
        // except its allowlist when spawning `php -S`, so extend it, this is
        // the same extension point Herd's HERD_PHP_*_INI_SCAN_DIR entries use.
        // Without this, the server child boots with zero extensions and dies
        // reading .env (mbstring polyfill → missing iconv).
        ServeCommand::$passthroughVariables[] = 'PHPRC';
        ServeCommand::$passthroughVariables[] = 'LD_LIBRARY_PATH';
    }
}
