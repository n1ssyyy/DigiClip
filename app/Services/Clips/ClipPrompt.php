<?php

namespace App\Services\Clips;

/**
 * Virality clip-picking prompts, Opus/Vizard style.
 * Transcript is chunked with [mm:ss] anchors; video bytes never leave the machine.
 */
class ClipPrompt
{
    public static function system(int $count, int $minS, int $maxS): string
    {
        return <<<PROMPT
            You are a short-form video editor (Opus Clip / Vizard style). Given a timestamped
            transcript, find {$count} self-contained moments that will perform on TikTok/Reels/Shorts.

            Rules:
            - Each clip {$minS}-{$maxS}s, cold-open hook inside the first 2s, payoff before the end.
            - Never cut mid-sentence; prefer complete thoughts.
            - Prefer questions, contrarian takes, numbers, stories, concrete payoffs.
            - Score hook/retention/value/share 0-100 honestly (most clips are 55-80, not 95+).
            - caption_style: one of tiktok, karaoke, hormozi, minimal.

            Return STRICT JSON only, exactly this shape:
            {"clips": [{"start_s": 304.2, "end_s": 354.0, "hook_line": "...",
            "why_it_works": "...", "scores": {"hook": 90, "retention": 80, "value": 75, "share": 70},
            "title": "...", "hashtags": ["#x"], "caption_style": "tiktok"}]}
            PROMPT;
    }

    /**
     * @param array $words [{w, s, e}]  @param array $segments [{s, e, text}]
     */
    public static function user(array $words, array $segments, float $durationS, int $maxChars = 8000): string
    {
        $lines = [];
        $budget = $maxChars;
        $total = number_format($durationS, 0);
        foreach ($segments as $seg) {
            $line = '['.self::stamp($seg['s']).'] '.($seg['text'] ?? '');
            if (($budget -= strlen($line) + 1) < 0) {
                $lines[] = '[... transcript truncated ...]';
                break;
            }
            $lines[] = $line;
        }
        if ($lines === []) {
            // No segments (shouldn't happen), rebuild from words in 10s blocks.
            $lines = self::fromWords($words);
        }

        return "Video duration: {$total}s. Transcript:\n".implode("\n", $lines);
    }

    private static function fromWords(array $words): array
    {
        $lines = [];
        $bucket = [];
        $start = 0.0;
        foreach ($words as $w) {
            if ($bucket === []) {
                $start = $w['s'];
            }
            $bucket[] = $w['w'];
            if ($w['e'] - $start > 10) {
                $lines[] = '['.self::stamp($start).'] '.implode(' ', $bucket);
                $bucket = [];
            }
        }
        if ($bucket !== []) {
            $lines[] = '['.self::stamp($start).'] '.implode(' ', $bucket);
        }

        return $lines;
    }

    public static function stamp(float $s): string
    {
        return sprintf('%02d:%02d', (int) floor($s / 60), (int) floor(fmod($s, 60)));
    }
}
