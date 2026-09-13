<?php

namespace App\Services\System;

use Illuminate\Support\Facades\Cache;
use Symfony\Component\Process\ExecutableFinder;
use Symfony\Component\Process\Process;

class HealthProbe
{
    public function report(): array
    {
        return Cache::remember('digiclip:health', 30, fn () => [
            'php' => [
                'version' => PHP_VERSION,
                'ok' => version_compare(PHP_VERSION, '8.2.0', '>='),
                'extensions' => $this->extensions(),
            ],
            'node' => $this->binaryVersion('node', ['--version']),
            'ffmpeg' => $this->ffmpeg(),
            'encoder' => $this->encoder(),
            'whisper' => $this->binaryVersion('whisper-cli', ['--version']),
            'storage' => $this->writable('app storage', storage_path('app')),
            'database' => $this->database(),
            'queue' => ['connection' => config('queue.default'), 'ok' => config('queue.default') === 'database'],
        ]);
    }

    /**
     * Probe the EFFECTIVE database file (default connection), not a
     * hardcoded path: inside the native runtime NativePHP rewrites the
     * default connection to a user-writable sqlite file, while the
     * repo-relative database.sqlite stays an untouched stub in /opt.
     */
    private function database(): array
    {
        $conn = (string) config('database.default', 'sqlite');
        $file = config("database.connections.{$conn}.database");
        if (! is_string($file) || $file === '') {
            $file = database_path('database.sqlite');
        }
        if ($file === ':memory:') {
            return ['ok' => true, 'path' => ':memory:', 'hint' => null];
        }

        return $this->writable('sqlite file', $file, touch: true);
    }

    private function extensions(): array
    {
        $need = ['ctype', 'curl', 'dom', 'fileinfo', 'mbstring', 'openssl', 'pdo', 'pdo_sqlite', 'tokenizer', 'xml', 'zip'];
        $out = [];
        foreach ($need as $ext) {
            $out[$ext] = extension_loaded($ext);
        }

        return $out;
    }

    private function resolve(string $name): ?string
    {
        foreach (['win-x64', 'mac-arm64', 'mac-x64', 'linux-x64'] as $platform) {
            $bundled = resource_path("bin/{$platform}/{$name}");
            if (is_file($bundled) && is_executable($bundled)) {
                return $bundled;
            }
            if (is_file($bundled.'.exe') && PHP_OS_FAMILY === 'Windows') {
                return $bundled.'.exe';
            }
        }

        return (new ExecutableFinder)->find($name);
    }

    private function binaryVersion(string $name, array $args): array
    {
        $path = $this->resolve($name);
        if (! $path) {
            return ['ok' => false, 'path' => null, 'version' => null, 'hint' => "Not bundled yet (resources/bin/*) and not on PATH."];
        }
        try {
            $p = new Process(array_merge([$path], $args));
            $p->mustRun();
            $line = trim(explode("\n", $p->getOutput() ?: $p->getErrorOutput())[0] ?? '');

            return ['ok' => true, 'path' => $path, 'version' => mb_substr($line, 0, 120), 'hint' => null];
        } catch (\Throwable $e) {
            return ['ok' => false, 'path' => $path, 'version' => null, 'hint' => mb_substr($e->getMessage(), 0, 160)];
        }
    }

    private function ffmpeg(): array
    {
        $base = $this->binaryVersion('ffmpeg', ['-version']);
        if (! $base['ok']) {
            return [...$base, 'libass' => null];
        }
        try {
            $p = new Process([$base['path'], '-hide_banner', '-filters']);
            $p->mustRun();
            $filters = $p->getOutput();
            $base['libass'] = str_contains($filters, ' ass')
                || str_contains($filters, 'subtitles');
        } catch (\Throwable) {
            $base['libass'] = false;
        }

        return $base;
    }

    private function encoder(): array
    {
        try {
            $enc = app(\App\Services\Render\RenderService::class)->pickEncoder();

            return ['ok' => true, 'version' => $enc, 'path' => null, 'hint' => 'auto-picked render encoder'];
        } catch (\Throwable $e) {
            return ['ok' => false, 'version' => null, 'path' => null, 'hint' => mb_substr($e->getMessage(), 0, 120)];
        }
    }

    private function writable(string $label, string $path, bool $touch = false): array
    {
        if ($touch && ! file_exists($path)) {
            @touch($path);
        }
        $ok = is_writable($path) || is_writable(dirname($path));

        return ['ok' => $ok, 'path' => $path, 'hint' => $ok ? null : "{$label} is not writable."];
    }
}
