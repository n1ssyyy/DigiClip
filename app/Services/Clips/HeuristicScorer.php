<?php

namespace App\Services\Clips;

/**
 * Offline fallback scorer: the app never dead-ends without an
 * OpenRouter key. Splits words into sentences, boosts questions / exclamations /
 * numbers / meaty lengths, then grows 20-45s windows around the best ones.
 * Output is RAW, the job still runs it through ClipValidator.
 */
class HeuristicScorer
{
    public function __construct(
        private float $targetMin = 20.0,
        private float $targetMax = 45.0,
    ) {}

    /**
     * @param string $context short reason shown in why_it_works, e.g. 'no API key'
     *   or 'LLM refused (402)'. The scorer text must never claim a wrong cause.
     */
    public function propose(array $words, int $count = 3, string $context = 'no API key'): array
    {
        if ($words === []) {
            return [];
        }
        $sentences = $this->sentences($words);
        if ($sentences === []) {
            return [];
        }
        usort($sentences, fn ($a, $b) => $b['score'] <=> $a['score']);

        $out = [];
        foreach (array_slice($sentences, 0, $count * 3) as $s) {
            if (count($out) >= $count) {
                break;
            }
            $mid = ($s['s'] + $s['e']) / 2;
            $dur = min($this->targetMax, max($this->targetMin, ($s['e'] - $s['s']) * 3));
            $out[] = [
                'start_s' => max(0.0, $mid - $dur / 2),
                'end_s' => $mid + $dur / 2,
                'hook_line' => mb_substr($s['text'], 0, 120),
                'why_it_works' => 'heuristic pick ('.$context.'): '.implode(', ', $s['reasons']),
                'scores' => ['hook' => $s['score'], 'retention' => 60, 'value' => 60, 'share' => 55],
                'title' => mb_substr($s['text'], 0, 80),
                'hashtags' => [],
                'caption_style' => 'tiktok',
            ];
        }

        return $out;
    }

    private function sentences(array $words): array
    {
        $out = [];
        $cur = [];
        foreach ($words as $w) {
            $cur[] = $w;
            if (preg_match('/[.!?…]+$/u', $w['w']) || count($cur) >= 30) {
                $out[] = $this->score($cur);
                $cur = [];
            }
        }
        if (count($cur) >= 5) {
            $out[] = $this->score($cur);
        }

        return array_values(array_filter($out, fn ($s) => str_word_count($s['text']) >= 5));
    }

    private function score(array $cur): array
    {
        $text = implode(' ', array_column($cur, 'w'));
        $score = 55;
        $reasons = [];
        if (str_contains($text, '?')) {
            $score += 12;
            $reasons[] = 'question hook';
        }
        if (str_contains($text, '!')) {
            $score += 6;
            $reasons[] = 'emphasis';
        }
        if (preg_match('/\d+/', $text)) {
            $score += 8;
            $reasons[] = 'concrete numbers';
        }
        $n = str_word_count($text);
        if ($n >= 8 && $n <= 25) {
            $score += 6;
            $reasons[] = 'tight length';
        }
        if ($reasons === []) {
            $reasons[] = 'steady delivery';
        }

        return [
            'text' => $text,
            's' => $cur[0]['s'],
            'e' => end($cur)['e'],
            'score' => min(92, $score),
            'reasons' => $reasons,
        ];
    }
}
