<?php

namespace App\Services\Captions;

/**
 * Words → ASS animated subtitles, TikTok style.
 * PHP port of the karaoke-subs grouping pattern: per-word {\k} karaoke tags
 * burned later with `ffmpeg -vf ass=...`. PlayRes fixed 1080×1920.
 */
class AssBuilder
{
    public const PLAY_W = 1080;

    public const PLAY_H = 1920;

    /**
     * Per-preset line budgets (words, chars). Sized from real font metrics:
     * 1080px frame − 80px margins = 1000px usable. Archivo Black caps run
     * ~0.8em wide, Anton ~0.55em, Inter ~0.55em, budgets keep every line
     * inside the frame with headroom (verified by tests/Unit/AssBuilderTest
     * width audit via Pillow).
     */
    public const LINE_BUDGETS = [
        'tiktok' => [3, 14],
        'karaoke' => [3, 14],
        'hormozi' => [3, 16],
        'minimal' => [4, 20],
        'beast' => [2, 12],
        'neon' => [3, 14],
        'highlight' => [3, 16],
        'ghost' => [4, 22],
    ];

    public const PRESETS = [        // TikTok chromatic: white caps, thin black keyline, pink drop (cyan lives in the UI preview; ASS carries one shadow tone).
        'tiktok' => [
            'font' => 'Archivo Black', 'size' => 84, 'caps' => true,
            'primary' => '&H00FFFFFF', 'secondary' => '&H00FFFFFF',
            'outline' => '&H00000000', 'back' => '&H00552CFE',
            'outline_w' => 2, 'shadow' => 2, 'bold' => 0,
            'alignment' => 2, 'margin_v' => 400, 'border' => 1,
        ],
        // Smooth karaoke sweep, centered.
        'karaoke' => [
            'font' => 'Archivo Black', 'size' => 84, 'caps' => true,
            'primary' => '&H0035E1FF', 'secondary' => '&H00FFFFFF',
            'outline' => '&H00000000', 'back' => '&H80000000',
            'outline_w' => 3, 'shadow' => 0, 'bold' => 0,
            'alignment' => 5, 'margin_v' => 0, 'border' => 1,
        ],
        // Hormozi: condensed caps on an opaque box, low.
        'hormozi' => [
            'font' => 'Anton', 'size' => 110, 'caps' => true,
            'primary' => '&H00FFFFFF', 'secondary' => '&H00FFFFFF',
            'outline' => '&H00000000', 'back' => '&HCC000000',
            'outline_w' => 2, 'shadow' => 0, 'bold' => 0,
            'alignment' => 2, 'margin_v' => 450, 'border' => 3,
        ],
        // Quiet minimal, low.
        'minimal' => [
            'font' => 'Inter Medium', 'size' => 64, 'caps' => false,
            'primary' => '&H00FFFFFF', 'secondary' => '&H00FFFFFF',
            'outline' => '&H00000000', 'back' => '&H99000000',
            'outline_w' => 2, 'shadow' => 1, 'bold' => 0,
            'alignment' => 2, 'margin_v' => 300, 'border' => 1,
        ],
        // Beast: giant white caps sung yellow, thick outline, no box, lower third.
        'beast' => [
            'font' => 'Archivo Black', 'size' => 96, 'caps' => true,
            'primary' => '&H0000FFFF', 'secondary' => '&H00FFFFFF',
            'outline' => '&H00000000', 'back' => '&H80000000',
            'outline_w' => 4, 'shadow' => 0, 'bold' => 0,
            'alignment' => 2, 'margin_v' => 420, 'border' => 1,
        ],
        // Neon: tall condensed cyan caps sweeping to white, centered.
        'neon' => [
            'font' => 'Anton', 'size' => 88, 'caps' => true,
            'primary' => '&H00FFFF00', 'secondary' => '&H00FFFFFF',
            'outline' => '&H00000000', 'back' => '&H80000000',
            'outline_w' => 3, 'shadow' => 0, 'bold' => 0,
            'alignment' => 5, 'margin_v' => 0, 'border' => 1,
        ],
        // Highlight: inverse hormozi, black caps on a lime box, low.
        'highlight' => [
            'font' => 'Anton', 'size' => 100, 'caps' => true,
            'primary' => '&H00000000', 'secondary' => '&H00000000',
            'outline' => '&H0035E6A3', 'back' => '&HCC000000',
            'outline_w' => 2, 'shadow' => 0, 'bold' => 0,
            'alignment' => 2, 'margin_v' => 450, 'border' => 3,
        ],
        // Ghost: quiet sentence case floating near the top.
        'ghost' => [
            'font' => 'Inter Medium', 'size' => 60, 'caps' => false,
            'primary' => '&H00FFFFFF', 'secondary' => '&H00FFFFFF',
            'outline' => '&H00000000', 'back' => '&H99000000',
            'outline_w' => 2, 'shadow' => 1, 'bold' => 0,
            'alignment' => 8, 'margin_v' => 200, 'border' => 1,
        ],
    ];

    public function build(array $words, string $preset = 'tiktok', float $offset = 0.0): string
    {
        $preset = isset(self::PRESETS[$preset]) ? $preset : 'tiktok';
        $style = self::PRESETS[$preset];
        $name = ucfirst($preset);
        [$maxWords, $maxChars] = self::LINE_BUDGETS[$preset];
        $lines = $this->group($this->attachPunctuation($words), $maxWords, $maxChars);

        $out = "[Script Info]\nTitle: DigiClip {$name}\nScriptType: v4.00+\nPlayResX: ".self::PLAY_W."\nPlayResY: ".self::PLAY_H."\nScaledBorderAndShadow: yes\nWrapStyle: 0\n\n";
        $out .= "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n";
        $out .= sprintf(
            "Style: %s,%s,%d,%s,%s,%s,%s,%d,0,0,0,100,100,0,0,%d,%d,%d,%d,40,40,%d,1\n\n",
            $name, $style['font'], $style['size'], $style['primary'], $style['secondary'],
            $style['outline'], $style['back'], $style['bold'], $style['border'],
            $style['outline_w'], $style['shadow'], $style['alignment'], $style['margin_v']
        );
        $out .= "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n";
        foreach ($lines as $line) {
            $text = '';
            foreach ($line as $w) {
                $word = $style['caps'] ? mb_strtoupper($w['w']) : $w['w'];
                $word = str_replace(['{', '}', "\n", "\r"], '', $word);
                $cs = max(1, (int) round(($w['e'] - $w['s']) * 100));
                $text .= "{\\k{$cs}}".$word.' ';
            }
            $out .= sprintf(
                "Dialogue: 0,%s,%s,%s,,0,0,0,,%s\n",
                self::stamp($line[0]['s'] - $offset), self::stamp(end($line)['e'] - $offset), $name, rtrim($text)
            );
        }

        return $out;
    }

    /** Fold lone punctuation ("?", "!") onto the previous word so karaoke
     *  never shows an orphaned mark as its own syllable. */
    private function attachPunctuation(array $words): array
    {
        $out = [];
        foreach ($words as $w) {
            if ($out !== [] && isset($w['w']) && preg_match('/^[^\p{L}\p{N}]+$/u', $w['w'])) {
                $last = count($out) - 1;
                $out[$last]['w'] .= $w['w'];
                $out[$last]['e'] = max($out[$last]['e'], $w['e'] ?? $out[$last]['e']);
            } else {
                $out[] = $w;
            }
        }

        return $out;
    }

    /** Group words into readable caption lines (4 words / 20 chars / 0.6s gap / 4s). */
    public function group(array $words, int $maxWords = 4, int $maxChars = 20, float $maxGap = 0.6, float $maxDur = 4.0): array
    {
        $lines = [];
        $cur = [];
        foreach ($words as $w) {
            $last = end($cur);
            if ($cur !== [] && (
                count($cur) >= $maxWords
                || mb_strlen(implode(' ', array_column($cur, 'w')).' '.$w['w']) > $maxChars
                || ($w['s'] - ($last['e'] ?? $w['s'])) > $maxGap
                || ($w['e'] - $cur[0]['s']) > $maxDur
            )) {
                $lines[] = $cur;
                $cur = [];
            }
            $cur[] = $w;
        }
        if ($cur !== []) {
            $lines[] = $cur;
        }

        return $lines;
    }

    /** ASS timestamp H:MM:SS.cc (centiseconds). */
    public static function stamp(float $s): string
    {
        $s = max(0.0, $s);
        $cs = (int) round($s * 100);

        return sprintf('%d:%02d:%02d.%02d', intdiv($cs, 360000), intdiv($cs % 360000, 6000), intdiv($cs % 6000, 100), $cs % 100);
    }
}
