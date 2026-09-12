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
        $this->app->when(WhisperCppTranscriber::class)
            ->needs('$model')
            ->give(fn () => Setting::get('stt_model') ?? config('digiclip.stt.default_model', 'base.en'));
    }

    public function boot(): void
    {
        // User-space toolchain (see README §0): our php needs PHPRC to find
        // its php.ini and LD_LIBRARY_PATH for libzip. `serve` strips all env
        // except its allowlist when spawning `php -S`, so extend it — this is
        // the same extension point Herd's HERD_PHP_*_INI_SCAN_DIR entries use.
        // Without this, the server child boots with zero extensions and dies
        // reading .env (mbstring polyfill → missing iconv).
        ServeCommand::$passthroughVariables[] = 'PHPRC';
        ServeCommand::$passthroughVariables[] = 'LD_LIBRARY_PATH';
    }
}
