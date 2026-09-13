<?php

namespace Tests\Feature;

use App\Models\Setting;
use App\Providers\AppServiceProvider;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AppKeyPinningTest extends TestCase
{
    use RefreshDatabase;

    public function test_undecryptable_setting_falls_back_to_default(): void
    {
        // Row written under a rotated APP_KEY (or hand-edited): the
        // encrypted cast throws on read. get() must degrade, never blow up
        // the Settings page or a queued job over one bad row.
        DB::table('settings')->insert([
            'key' => 'stt_model',
            'value' => 'definitely-not-encrypted',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->assertSame('base.en', Setting::get('stt_model', 'base.en'));
    }

    public function test_app_key_pins_per_machine_and_restores(): void
    {
        $dir = sys_get_temp_dir().'/digiclip-keytest-'.uniqid();
        mkdir($dir, 0700, true);
        $_SERVER['NATIVEPHP_USER_DATA_PATH'] = $dir;
        config(['nativephp-internal.running' => true]);

        try {
            config(['app.key' => 'base64:'.base64_encode('first-packaged-key-32bytes!!')]);
            (new AppServiceProvider($this->app))->register();
            $this->assertFileExists($dir.'/app-key');

            // Next release ships a fresh key: the pinned one must win.
            config(['app.key' => 'base64:'.base64_encode('second-packaged-key-32bytes!')]);
            (new AppServiceProvider($this->app))->register();
            $this->assertSame('base64:'.base64_encode('first-packaged-key-32bytes!!'), config('app.key'));
        } finally {
            unset($_SERVER['NATIVEPHP_USER_DATA_PATH']);
            array_map('unlink', glob($dir.'/*') ?: []);
            rmdir($dir);
        }
    }

    public function test_pinning_skipped_outside_native_runtime(): void
    {
        config(['nativephp-internal.running' => false]);
        config(['app.key' => 'base64:'.base64_encode('dev-key-32bytes-padding-here!')]);
        (new AppServiceProvider($this->app))->register();

        $this->assertSame('base64:'.base64_encode('dev-key-32bytes-padding-here!'), config('app.key'));
    }
}
