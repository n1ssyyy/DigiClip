<?php

namespace App\Services\Stt;

use App\Services\System\GpuDetector;
use RuntimeException;
use Symfony\Component\Process\Process;

/**
 * whisper.cpp sidecar transcriber, no Python, no torch.
 * Requires 16kHz mono WAV in; emits word-level timestamps out.
 *
 * NOTE: whisper.cpp `--output-json` segment schema varies by release
 * (timestamps "HH:MM:SS,mmm" + text; newer builds add per-token timing).
 * parseOutput() prefers token timing when present, else distributes each
 * segment evenly across its words (captions still work, pop-style).
 * Verified against the real binary.
 */
class WhisperCppTranscriber implements Transcriber
{
    public function __construct(
        private BinaryManager $binaries,
        private ModelManager $models,
        private string $model = 'base.en',
        private bool $gpu = true,
        private ?GpuDetector $gpus = null,
    ) {}

    public function modelId(): string
    {
        return $this->model;
    }

    /**
     * Vulkan sidecar path when GPU transcription is wanted AND shipped
     * (resources/bin/<platform>/whisper-cli-vulkan[.exe]); null otherwise.
     * macOS and bare-Windows installs fall back to the CPU binary.
     */
    public function gpuBinary(): ?string
    {
        return $this->binaries->resolve('whisper-cli-vulkan');
    }

    /** Prefer the Vulkan sidecar for GPU runs, else the regular binary. */
    public function pickBinary(bool $gpu): ?string
    {
        if ($gpu && ($vulkan = $this->gpuBinary())) {
            return $vulkan;
        }

        return $this->binaries->resolve('whisper-cli');
    }

    public function cpuCount(): int
    {
        $nproc = is_string($n = @shell_exec('nproc')) ? (int) $n : 0;
        if ($nproc <= 0) {
            // Windows has no nproc; the process env always carries this.
            $nproc = (int) (getenv('NUMBER_OF_PROCESSORS') ?: 0);
        }

        return max(1, $nproc > 0 ? $nproc : 4);
    }

    public function transcribe(string $wavPath, array $options = []): TranscriptionResult
    {
        if (! is_file($wavPath)) {
            throw new RuntimeException("Audio not found: {$wavPath}");
        }
        $whisper = $this->binaries->require('whisper-cli');
        $modelId = $options['model'] ?? $this->model;
        // First-run self-provisioning: fetch the ggml weights on demand
        // instead of failing the whole pipeline when they are absent.
        // Unknown ids still throw (via meta()), network failures bubble up
        // to the job's failed() handler like any other transcribe error.
        if (! $this->models->isDownloaded($modelId)) {
            $this->models->download($modelId);
        }
        $modelPath = $this->models->require($modelId);
        // GPU = Vulkan sidecar (default device); anything else is an
        // explicit CPU run via -ng. This whisper.cpp release uses -ng/-dev,
        // not the older -ngl flag (unknown flags abort with no JSON out).
        $gpu = (bool) ($options['gpu'] ?? $this->gpu);
        $vulkan = $gpu ? $this->gpuBinary() : null;
        $whisper = $vulkan ?? $this->binaries->require('whisper-cli');
        $lang = $options['lang'] ?? 'en';
        // Leave two cores for the app server + UI: a fully loaded box
        // makes page loads crawl while transcription runs.
        $threads = $options['threads'] ?? max(1, $this->cpuCount() - 2);
        $outPrefix = $options['out_prefix'] ?? (sys_get_temp_dir().'/digiclip-'.uniqid());

        // -dev maps our ranked-best GPU to whisper's loader order (device 0
        // is often a weak iGPU: measured 23s there vs 1.3s on the RTX 3050
        // for the same base.en clip). Unknown mapping → omit (default).
        $devIndex = array_key_exists('vulkan_device', $options)
            ? $options['vulkan_device']
            : ($vulkan !== null ? $this->resolveVulkanIndex($modelPath) : null);

        $p = new Process($this->buildCommand(
            $whisper, $modelPath, $wavPath, $lang, $outPrefix, $threads,
            $vulkan !== null, $devIndex,
        ));
        $p->setTimeout($options['timeout'] ?? 1800);
        // Cooperative cancellation: the job passes `should_cancel`, polled
        // from the process output callback. whisper.cpp streams progress to
        // stderr, so the callback fires for the whole run; returning false
        // stops the process. Without it a pause/delete waits out the full
        // transcription while holding the only media worker.
        $shouldCancel = $options['should_cancel'] ?? null;
        if ($shouldCancel === null) {
            $p->mustRun();
        } else {
            try {
                $p->mustRun(function () use ($shouldCancel, $p) {
                    try {
                        if ($shouldCancel()) {
                            $p->stop(5);
                        }
                    } catch (\Throwable) {
                    }
                });
            } catch (\Throwable $e) {
                try {
                    if ($shouldCancel()) {
                        throw new TranscriptionCancelled('Transcription cancelled.');
                    }
                } catch (TranscriptionCancelled $cancelled) {
                    throw $cancelled;
                }
                throw $e;
            }
        }

        $jsonPath = $outPrefix.'.json';
        if (! is_file($jsonPath)) {
            throw new RuntimeException('whisper-cli produced no JSON output.');
        }
        $data = json_decode(file_get_contents($jsonPath), true);
        @unlink($jsonPath);

        return $this->parseOutput($data ?? [], $options['model'] ?? $this->model);
    }

    /** Pure command builder (no I/O): unit-tested flag matrix. */
    public function buildCommand(
        string $whisper,
        string $modelPath,
        string $wavPath,
        string $lang,
        string $outPrefix,
        int $threads,
        bool $isVulkan,
        mixed $devIndex = null,
    ): array {
        $cmd = [
            $whisper,
            '-m', $modelPath,
            '-f', $wavPath,
            '-l', $lang,
            '-oj', '-ojf', '-of', $outPrefix,
            '-t', (string) $threads,
        ];
        if ($isVulkan) {
            if (is_int($devIndex) && $devIndex >= 0) {
                array_push($cmd, '-dev', (string) $devIndex);
            }
        } else {
            $cmd[] = '-ng';
        }

        return $cmd;
    }

    private function resolveVulkanIndex(string $modelPath): ?int
    {
        try {
            if ($this->gpus === null) {
                return null;
            }
            $vulkan = $this->gpuBinary();
            if ($vulkan === null) {
                return null;
            }

            return $this->gpus->preferredVulkanIndex($vulkan, $modelPath);
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * @param array{transcription?: array, result?: array} $data
     */
    public function parseOutput(array $data, ?string $model = null): TranscriptionResult
    {
        $words = [];
        $segments = [];
        foreach ($data['transcription'] ?? [] as $seg) {
            $from = isset($seg['timestamps']['from']) ? self::toSeconds($seg['timestamps']['from']) : 0.0;
            $to = isset($seg['timestamps']['to']) ? self::toSeconds($seg['timestamps']['to']) : $from;
            $text = trim($seg['text'] ?? '');
            if ($text === '') {
                continue;
            }
            $segments[] = ['s' => $from, 'e' => $to, 'text' => $text];

            $tokenWords = $this->tokenWords($seg);
            if ($tokenWords !== null) {
                array_push($words, ...$tokenWords);
                continue;
            }
            // Fallback: spread segment time evenly across whitespace words.
            $parts = preg_split('/\s+/', $text, -1, PREG_SPLIT_NO_EMPTY);
            $n = count($parts);
            $dur = max(0.0, $to - $from);
            foreach ($parts as $i => $w) {
                $words[] = [
                    'w' => $w,
                    's' => round($from + ($dur * $i / max(1, $n)), 3),
                    'e' => round($from + ($dur * ($i + 1) / max(1, $n)), 3),
                    'conf' => null,
                ];
            }
        }

        return new TranscriptionResult(
            words: $words,
            segments: $segments,
            language: $data['result']['language'] ?? 'en',
            model: $model ?? $this->model,
        );
    }

    /**
     * whisper.cpp `-ojf` exposes per-token timing inside a segment:
     * tokens[] = [{text, timestamps:{from,to}, offsets, id, p, t_dtw}].
     * Special tokens ([_BEG_], [_TT_*], etc.) are skipped. Plain `-oj` has
     * no tokens → null → caller uses the even-split fallback.
     */
    private function tokenWords(array $seg): ?array
    {
        $tokens = $seg['tokens'] ?? null;
        if (! is_array($tokens) || $tokens === []) {
            return null;
        }
        $out = [];
        foreach ($tokens as $t) {
            $text = trim($t['text'] ?? '');
            if ($text === '' || preg_match('/^\[.*\]$/', $text)) {
                continue;
            }
            if (! isset($t['timestamps']['from'], $t['timestamps']['to'])) {
                continue;
            }
            $out[] = [
                'w' => $text,
                's' => self::toSeconds($t['timestamps']['from']),
                'e' => self::toSeconds($t['timestamps']['to']),
                'conf' => isset($t['p']) ? round((float) $t['p'], 3) : null,
            ];
        }

        return $out === [] ? null : $out;
    }

    public static function toSeconds(string $ts): float
    {
        // "HH:MM:SS,mmm" or "MM:SS.mmm"
        if (preg_match('/(?:(\d+):)?(\d+):(\d+)[,.](\d+)/', $ts, $m)) {
            return ((int) $m[1] * 3600) + ((int) $m[2] * 60) + (int) $m[3] + ((int) $m[4] / 1000);
        }

        return 0.0;
    }
}
