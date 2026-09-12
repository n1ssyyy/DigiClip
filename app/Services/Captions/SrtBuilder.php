<?php

namespace App\Services\Captions;

/**
 * Words → SRT cues (see AssBuilder for karaoke captions).
 * Groups: ≤8 words, ≤42 chars, ≤0.8s gap, ≤5s per cue.
 */
class SrtBuilder
{
    public function fromWords(array $words, int $maxWords = 8, int $maxChars = 42, float $maxGap = 0.8, float $maxDur = 5.0): string
    {
        $cues = [];
        $cur = [];
        foreach ($words as $w) {
            $last = end($cur);
            if ($cur !== [] && (
                count($cur) >= $maxWords
                || $this->textLen($cur) + 1 + strlen($w['w']) > $maxChars
                || ($w['s'] - ($last['e'] ?? $w['s'])) > $maxGap
                || ($w['e'] - $cur[0]['s']) > $maxDur
            )) {
                $cues[] = $cur;
                $cur = [];
            }
            $cur[] = $w;
        }
        if ($cur !== []) {
            $cues[] = $cur;
        }

        $out = '';
        foreach ($cues as $i => $cue) {
            $out .= ($i + 1)."\n";
            $out .= self::stamp($cue[0]['s']).' --> '.self::stamp(end($cue)['e'])."\n";
            $out .= $this->lines($cue)."\n\n";
        }

        return $out;
    }

    private function textLen(array $cue): int
    {
        return strlen(implode(' ', array_column($cue, 'w')));
    }

    /** Split long cues into two balanced lines. */
    private function lines(array $cue): string
    {
        $text = implode(' ', array_column($cue, 'w'));
        if (strlen($text) <= 42) {
            return $text;
        }
        $words = array_column($cue, 'w');
        $mid = (int) ceil(count($words) / 2);

        return implode(' ', array_slice($words, 0, $mid))."\n".implode(' ', array_slice($words, $mid));
    }

    public static function stamp(float $s): string
    {
        $ms = (int) round($s * 1000);
        $h = intdiv($ms, 3600000);
        $m = intdiv($ms % 3600000, 60000);
        $sec = intdiv($ms % 60000, 1000);

        return sprintf('%02d:%02d:%02d,%03d', $h, $m, $sec, $ms % 1000);
    }
}
