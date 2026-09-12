<?php

namespace App\Services\Stt;

use RuntimeException;
use Symfony\Component\Process\Process;

/**
 * Locates bundled-or-system media binaries (PLAN.MD §5).
 * Order: resources/bin/{platform}/ → system PATH. Never requires sudo.
 */
class BinaryManager
{
    public function platformDir(): string
    {
        $os = PHP_OS_FAMILY === 'Windows' ? 'win-x64' : match (php_uname('m')) {
            'arm64', 'aarch64' => PHP_OS_FAMILY === 'Darwin' ? 'mac-arm64' : 'linux-arm64',
            default => PHP_OS_FAMILY === 'Darwin' ? 'mac-x64' : 'linux-x64',
        };

        return "bin/{$os}";
    }

    public function resolve(string $name): ?string
    {
        $candidates = [resource_path($this->platformDir()."/{$name}")];
        if (PHP_OS_FAMILY === 'Windows') {
            $candidates[] = resource_path($this->platformDir()."/{$name}.exe");
        }
        foreach ($candidates as $path) {
            if (is_file($path)) {
                $this->ensureExecutable($path);

                return $path;
            }
        }

        $finder = PHP_OS_FAMILY === 'Windows' ? 'where' : 'command -v';
        $found = trim((string) shell_exec("{$finder} ".escapeshellarg($name).' 2>/dev/null'));

        return $found !== '' ? explode("\n", $found)[0] : null;
    }

    public function require(string $name): string
    {
        $path = $this->resolve($name);
        if (! $path) {
            throw new RuntimeException("{$name} not found (checked resources/{$this->platformDir()}/ and PATH). See /health.");
        }

        return $path;
    }

    public function ffmpegHasLibass(string $ffmpeg): bool
    {
        try {
            $p = new Process([$ffmpeg, '-hide_banner', '-filters']);
            $p->mustRun();

            return str_contains($p->getOutput(), ' ass') || str_contains($p->getOutput(), 'subtitles');
        } catch (\Throwable) {
            return false;
        }
    }

    private function ensureExecutable(string $path): void
    {
        if (PHP_OS_FAMILY !== 'Windows' && ! is_executable($path)) {
            @chmod($path, 0755);
        }
    }
}
