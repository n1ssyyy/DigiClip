<?php

namespace App\Services\System;

use Illuminate\Support\Facades\Cache;
use Symfony\Component\Process\Process;

/**
 * Discrete + integrated GPU inventory for the transcription toggle.
 *
 * whisper.cpp offloads to a single device per run, so "use the GPUs" means:
 * detect everything, rank discrete VRAM beasts first, and transcribe on
 * the winner. Strategies are per-OS and best-effort; anything unknown is
 * skipped, never fatal. Results cache for an hour (GPUs don't hot-plug).
 *
 * Each device: ['name' => string, 'memory_mb' => ?int, 'discrete' => bool,
 *   'source' => 'nvidia-smi'|'wmi'|'lspci'|'system-profiler'].
 */
class GpuDetector
{
    public const CACHE_KEY = 'digiclip:gpu-devices';

    public const VULKAN_CACHE_KEY = 'digiclip:vulkan-devices';

    public function __construct(private mixed $run = null) {}

    /** Best-first list, cached. */
    public function detect(): array
    {
        try {
            return Cache::remember(static::CACHE_KEY, 3600, fn () => $this->rank($this->probe()));
        } catch (\Throwable) {
            return $this->rank($this->probe());
        }
    }

    public function best(): ?array
    {
        return $this->detect()[0] ?? null;
    }

    public function available(): bool
    {
        return $this->best() !== null;
    }

    /**
     * Resolve the Settings toggle: an explicit save always wins; untouched
     * settings auto-enable when a GPU is present (auto = on with GPU).
     */
    public function enabled(mixed $saved): bool
    {
        if ($saved === null) {
            return $this->available();
        }

        return filter_var($saved, FILTER_VALIDATE_BOOLEAN);
    }

    /** @return list<array{name:string,memory_mb:?int,discrete:bool,source:string}> */
    public function probe(): array
    {
        $found = [];
        foreach ($this->fromNvidiaSmi() as $gpu) {
            $found[] = $gpu;
        }
        if (PHP_OS_FAMILY === 'Windows') {
            foreach ($this->fromWmi() as $gpu) {
                $found[] = $gpu;
            }
        } elseif (PHP_OS_FAMILY === 'Linux') {
            foreach ($this->fromLspci() as $gpu) {
                $found[] = $gpu;
            }
        } elseif (PHP_OS_FAMILY === 'Darwin') {
            foreach ($this->fromSystemProfiler() as $gpu) {
                $found[] = $gpu;
            }
        }

        return $found;
    }

    /** Discrete first, then most VRAM (unknown last), then name. */
    public function rank(array $gpus): array
    {
        usort($gpus, fn ($a, $b) =>
            [(int) ! $a['discrete'], -($a['memory_mb'] ?? -1), $a['name']]
            <=>
            [(int) ! $b['discrete'], -($b['memory_mb'] ?? -1), $b['name']]
        );

        return array_values($gpus);
    }

    /**
     * whisper.cpp numbers Vulkan devices in loader order (device 0 is often
     * a weak iGPU), so "use the best GPU" means mapping our ranked winner
     * to whisper's `-dev N` index. Enumerated once via the shipped Vulkan
     * binary against a 1s synthesized silence WAV, cached an hour.
     * Null = unknown, caller omits -dev (whisper default). Never throws.
     */
    public function preferredVulkanIndex(string $vulkanBinary, string $modelPath): ?int
    {
        try {
            $best = $this->best();
            if ($best === null) {
                return null;
            }
            $devices = $this->vulkanDevices($vulkanBinary, $modelPath);
            if ($devices === []) {
                return null;
            }
            $scored = [];
            foreach ($devices as $dev) {
                $scored[] = [$this->nameScore($best['name'], $dev['name']), $dev['index']];
            }
            usort($scored, fn ($a, $b) => $b[0] <=> $a[0]);
            // 0.5 = at least half the best-GPU tokens matched (an RTX 3050
            // vs its Vulkan twin scores 1.0; an unrelated iGPU ~0.1).
            return $scored[0][0] >= 0.5 ? (int) $scored[0][1] : null;
        } catch (\Throwable) {
            return null;
        }
    }

    /** @return list<array{index:int,name:string}> */
    public function vulkanDevices(string $vulkanBinary, string $modelPath): array
    {
        try {
            $key = static::VULKAN_CACHE_KEY.':'.md5($vulkanBinary);
            $devices = Cache::remember($key, 3600, fn () => $this->parseVulkanDevices(
                $this->probeVulkan($vulkanBinary, $modelPath) ?? ''
            ));
            // Cache::remember may return null on exotic drivers; normalize.
            return is_array($devices) ? array_values($devices) : [];
        } catch (\Throwable) {
            return $this->parseVulkanDevices($this->probeVulkan($vulkanBinary, $modelPath) ?? '');
        }
    }

    /** Token-overlap 0..1 of $candidate against $reference (both GPU names). */
    public function nameScore(string $reference, string $candidate): float
    {
        $ref = $this->nameTokens($reference);
        if ($ref === []) {
            return 0.0;
        }
        $cand = array_flip($this->nameTokens($candidate));
        $hits = 0;
        foreach ($ref as $tok) {
            if (isset($cand[$tok])) {
                $hits++;
            }
        }

        return $hits / count($ref);
    }

    /** @return list<string> */
    private function nameTokens(string $name): array
    {
        $name = strtolower($name);
        preg_match_all('/[a-z0-9]+/', $name, $m);
        // Generic filler ("graphics", "laptop", "mobile", "corporation")
        // inflates unrelated matches; model/generation tokens decide.
        $stop = ['graphics' => 1, 'laptop' => 1, 'mobile' => 1, 'corporation' => 1,
            'inc' => 1, 'corp' => 1, 'co' => 1, 'ltd' => 1, 'the' => 1];
        $out = [];
        foreach ($m[0] ?? [] as $tok) {
            if (! isset($stop[$tok]) && ! isset($out[$tok])) {
                $out[$tok] = $tok;
            }
        }

        return array_values($out);
    }

    /** @return list<array{index:int,name:string}> */
    public function parseVulkanDevices(string $output): array
    {
        $devices = [];
        // ggml_vulkan: 1 = NVIDIA GeForce RTX 3050 Laptop GPU (NVIDIA) | uma: ...
        foreach (preg_split('/\R/', $output) ?: [] as $line) {
            if (preg_match('/ggml_vulkan:\s*(\d+)\s*=\s*(.+?)\s*(?:\||$)/', $line, $m)) {
                $name = trim($m[2]);
                if ($name !== '') {
                    $devices[] = ['index' => (int) $m[1], 'name' => $name];
                }
            }
        }

        return $devices;
    }

    /**
     * Run the Vulkan binary against synthesized silence; returns combined
     * stdout+stderr (device enumeration prints to stderr). Null when the
     * binary/model is missing or the run itself cannot start.
     */
    private function probeVulkan(string $vulkanBinary, string $modelPath): ?string
    {
        try {
            // Test seam first (no filesystem guards): fakes control output.
            if (is_callable($this->run)) {
                return ($this->run)("vulkan-probe {$vulkanBinary}");
            }
            if (! is_file($vulkanBinary) || ! is_file($modelPath)) {
                return null;
            }
            $wav = self::probeWav();
            $prefix = sys_get_temp_dir().'/digiclip-vulkan-probe-'.getmypid();
            $p = Process::fromShellCommandline(
                implode(' ', array_map(
                    fn ($a) => escapeshellarg($a),
                    [$vulkanBinary, '-m', $modelPath, '-f', $wav, '-l', 'en', '-of', $prefix, '-t', '1']
                ))
            );
            // Model load + one-time pipeline compile can take a while;
            // this only runs in the background transcribe path, hourly max.
            $p->setTimeout(180);
            $p->run();
            $json = $prefix.'.json';
            if (is_file($json)) {
                @unlink($json);
            }

            return $p->getOutput()."\n".$p->getErrorOutput();
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * 1s of 16kHz mono silence for Vulkan device probing. Synthesized in
     * PHP (no ffmpeg dependency, portable to the Windows installer).
     */
    public static function probeWav(): string
    {
        $path = sys_get_temp_dir().'/digiclip-vulkan-probe.wav';
        if (is_file($path)) {
            return $path;
        }
        $samples = 16000;
        $data = str_repeat("\x00\x00", $samples);
        // fmt chunk: size(4)=16, format(2)=1 PCM, channels(2)=1,
        // rate(4)=16000, byte rate(4)=32000, align(2)=2, bits(2)=16.
        $wav = 'RIFF'.pack('V', 36 + strlen($data)).'WAVEfmt '.pack('VvvVVvv',
            16, 1, 1, 16000, 32000, 2, 16).'data'.pack('V', strlen($data)).$data;
        @file_put_contents($path, $wav);

        return $path;
    }

    /** @return list<array> */
    public function fromNvidiaSmi(): array
    {
        // CSV, no header, MiB units: "NVIDIA GeForce RTX 3050 Laptop GPU, 4096"
        $out = $this->exec('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits');
        if ($out === null) {
            return [];
        }
        $gpus = [];
        foreach (preg_split('/\R/', trim($out)) ?: [] as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }
            // Name itself may contain commas — memory is the last field.
            $pos = strrpos($line, ',');
            if ($pos === false) {
                continue;
            }
            $name = trim(substr($line, 0, $pos));
            $mem = (int) filter_var(substr($line, $pos + 1), FILTER_SANITIZE_NUMBER_INT);
            if ($name === '') {
                continue;
            }
            $gpus[] = ['name' => $name, 'memory_mb' => $mem > 0 ? $mem : null, 'discrete' => true, 'source' => 'nvidia-smi'];
        }

        return $gpus;
    }

    /** @return list<array> */
    public function fromWmi(): array
    {
        $out = $this->exec('powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress"');
        if ($out === null) {
            return [];
        }
        try {
            $rows = json_decode($out, true, 4, JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            return [];
        }
        if (isset($rows['Name'])) {
            $rows = [$rows];
        }
        $gpus = [];
        foreach ((array) $rows as $row) {
            $name = trim((string) ($row['Name'] ?? ''));
            if ($name === '') {
                continue;
            }
            // AdapterRAM is uint32: 4GB+ cards saturate at 4294967295.
            $ram = (int) ($row['AdapterRAM'] ?? 0);
            $gpus[] = [
                'name' => $name,
                'memory_mb' => ($ram > 0 && $ram < 4294967295) ? (int) round($ram / 1048576) : null,
                'discrete' => $this->looksDiscrete($name),
                'source' => 'wmi',
            ];
        }

        return $gpus;
    }

    /** @return list<array> */
    public function fromLspci(): array
    {
        $out = $this->exec("lspci -mm | grep -i -E 'vga|3d|display'");
        if ($out === null) {
            return [];
        }
        $gpus = [];
        foreach (preg_split('/\R/', trim($out)) ?: [] as $line) {
            // -mm quotes every field, slot included:
            // "01:00.0" "3D controller" "NVIDIA Corporation" "GA107M [GeForce RTX 3050 Mobile]"
            preg_match_all('/"([^"]*)"/', $line, $m);
            $parts = $m[1] ?? [];
            if (count($parts) < 3) {
                continue;
            }
            $class = $parts[1];
            $name = trim($parts[3] ?? '') !== '' ? trim($parts[3]) : trim($parts[2]);
            if ($name === '') {
                continue;
            }
            $gpus[] = [
                'name' => $name,
                'memory_mb' => null,
                'discrete' => stripos($class, '3D') !== false || $this->looksDiscrete($name),
                'source' => 'lspci',
            ];
        }

        return $gpus;
    }

    /** @return list<array> */
    public function fromSystemProfiler(): array
    {
        $out = $this->exec('system_profiler SPDisplaysDataType');
        if ($out === null) {
            return [];
        }
        $gpus = [];
        foreach (preg_split('/\R/', $out) ?: [] as $line) {
            if (preg_match('/^\s*Chipset Model:\s*(.+?)\s*$/', $line, $m)) {
                $name = trim($m[1]);
                if ($name !== '' && ! str_contains($name, 'Color LCD')) {
                    $gpus[] = [
                        'name' => $name,
                        'memory_mb' => null,
                        'discrete' => $this->looksDiscrete($name),
                        'source' => 'system-profiler',
                    ];
                }
            }
        }

        return $gpus;
    }

    private function looksDiscrete(string $name): bool
    {
        return (bool) preg_match('/\b(RTX|GTX|Quadro|Tesla|Titan|Radeon\s+(RX|Pro|VII)|Arc\s+A|GeForce)\b/i', $name);
    }

    private function exec(string $command): ?string
    {
        if (is_callable($this->run)) {
            try {
                return ($this->run)($command);
            } catch (\Throwable) {
                return null;
            }
        }
        try {
            $p = Process::fromShellCommandline($command);
            $p->setTimeout(10);
            $p->run();

            return $p->isSuccessful() ? trim($p->getOutput()) : null;
        } catch (\Throwable) {
            return null;
        }
    }
}
