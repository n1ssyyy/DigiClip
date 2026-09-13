<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * The packaged Electron main process inlines MAIN_VITE_NATIVEPHP_BUILD_PATH
 * from nativephp/electron/.env.production at build time. v1.0.1 shipped
 * without that file (publish step skipped dotfiles + root .gitignore
 * ignored .env.production), so the installed app crashed in the main
 * process before opening any window:
 *   TypeError: path.resolve(dirname, undefined).
 * These files must exist, be committed, and carry the variable.
 */
class ElectronBuildEnvTest extends TestCase
{
    public function test_production_electron_env_is_committed_and_defines_build_path(): void
    {
        foreach (['.env.production', '.env.development'] as $file) {
            $path = base_path("nativephp/electron/{$file}");
            $this->assertFileExists($path, "Missing {$file} — packaged app will crash on startup");
            $this->assertStringContainsString(
                'MAIN_VITE_NATIVEPHP_BUILD_PATH',
                (string) file_get_contents($path),
            );
        }
    }

    public function test_production_env_cleanup_keeps_reverb_secret(): void
    {
        $patterns = (array) config('nativephp.cleanup_env_keys', []);

        foreach ($patterns as $pattern) {
            $this->assertFalse(
                fnmatch($pattern, 'REVERB_APP_SECRET', FNM_CASEFOLD),
                "cleanup_env_keys pattern '{$pattern}' strips REVERB_APP_SECRET from the packaged .env",
            );
        }
    }
}
