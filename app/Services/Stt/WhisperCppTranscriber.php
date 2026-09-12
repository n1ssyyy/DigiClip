<?php

namespace App\Services\Stt;

use RuntimeException;
use Symfony\Component\Process\Process;

/**
 * whisper.cpp sidecar transcriber — no Python, no torch (PLAN.MD §5).
 * Requires 16kHz mono WAV in; emits word-level timestamps out.
 *
 * NOTE: whisper.cpp `--output-json` segment schema varies by release
 * (timestamps "HH:MM:SS,mmm" + text; newer builds add per-token timing).
 * parseOutput() prefers token timing when present, else distributes each
 * segment evenly across its words (captions still work, pop-style).
 * Verified against the real binary in the M1 binaries step.
 */
class WhisperCppTranscriber implements Transcriber
{
    public function __construct(
        private BinaryManager $binaries,
        private ModelManager $models,
        private string $model = 'base.en',
    ) {}

    public function modelId(): string
    {
        return $this->model;
    }

    public function transcribe(string $wavPath, array $options = []): TranscriptionResult
    {
        if (! is_file($wavPath)) {
            throw new RuntimeException("Audio not found: {$wavPath}");
        }
        $whisper = $this->binaries->require('whisper-cli');
        $modelPath = $this->models->require($options['model'] ?? $this->model);
        $lang = $options['lang'] ?? 'en';
        $threads = $options['threads'] ?? max(1, (int) shell_exec('nproc') ?: 4);
        $outPrefix = $options['out_prefix'] ?? (sys_get_temp_dir().'/digiclip-'.uniqid());

        $p = new Process([
            $whisper,
            '-m', $modelPath,
            '-f', $wavPath,
            '-l', $lang,
            '-oj', '-ojf', '-of', $outPrefix,
            '-t', (string) $threads,
        ]);
        $p->setTimeout($options['timeout'] ?? 1800);
        $p->mustRun();

        $jsonPath = $outPrefix.'.json';
        if (! is_file($jsonPath)) {
            throw new RuntimeException('whisper-cli produced no JSON output.');
        }
        $data = json_decode(file_get_contents($jsonPath), true);
        @unlink($jsonPath);

        return $this->parseOutput($data ?? [], $options['model'] ?? $this->model);
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
