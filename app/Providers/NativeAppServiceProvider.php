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
    }

    /**
     * The realtime socket (Reverb) must run for event-based UI updates.
     * No-op outside the native runtime: without the Electron API bridge
     * these calls fail fast and are ignored (dev runs reverb:start manually).
     */
    private function ensureReverb(): void
    {
        try {
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
