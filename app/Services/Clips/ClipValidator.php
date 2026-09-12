<?php

namespace App\Services\Clips;

/**
 * Local post-processing gate (PLAN.MD §6 — non-negotiable):
 * validate → clamp → SNAP to word boundaries → merge/dedupe → rank → cap.
 * Pure + unit-tested. Used for both LLM and heuristic candidates.
 */
class ClipValidator
{
    public function __construct(
        private float $minS = 15.0,
        private float $maxS = 90.0,
        private float $padS = 0.25,
    ) {}

    /**
     * @param array $raw    LLM/heuristic clip dicts
     * @param array $words  [{w, s, e}] sorted by s
     * @param float $durationS
     */
    public function normalize(array $raw, array $words, float $durationS, int $count = 3): array
    {
        if ($words === [] || $durationS <= 0) {
            return [];
        }
        $out = [];
        foreach ($raw as $c) {
            $clip = $this->one($c, $words, $durationS);
            if ($clip) {
                $out[] = $clip;
            }
        }
        $out = $this->dedupe($out);
        usort($out, fn ($a, $b) => $b['score_total'] <=> $a['score_total']);
        foreach ($out as $i => &$c) {
            $c['rank'] = $i + 1;
        }

        return array_slice($out, 0, max(1, $count));
    }

    private function one(array $c, array $words, float $durationS): ?array
    {
        if (! isset($c['start_s'], $c['end_s']) || ! is_numeric($c['start_s']) || ! is_numeric($c['end_s'])) {
            return null;
        }
        [$s, $e] = $this->snap((float) $c['start_s'], (float) $c['end_s'], $words, $durationS);
        if ($e - $s < $this->minS) {
            return null;
        }
        if ($e - $s > $this->maxS) {
            $e = $s + $this->maxS;
        }
        $scores = $this->scores($c['scores'] ?? []);
        $tags = array_values(array_filter(array_map(
            fn ($t) => '#'.ltrim(trim((string) $t), '#'),
            (array) ($c['hashtags'] ?? [])
        )));

        return [
            'start_s' => round($s, 2),
            'end_s' => round($e, 2),
            'hook_line' => mb_substr(trim((string) ($c['hook_line'] ?? '')), 0, 200),
            'why_it_works' => mb_substr(trim((string) ($c['why_it_works'] ?? '')), 0, 500),
            'scores' => $scores,
            'score_total' => $scores['total'],
            'title' => mb_substr(trim((string) ($c['title'] ?? '')), 0, 150),
            'hashtags' => array_slice($tags, 0, 8),
            'caption_style' => in_array($c['caption_style'] ?? '', ['tiktok', 'karaoke', 'hormozi', 'minimal'], true)
                ? $c['caption_style'] : 'tiktok',
        ];
    }

    /** Snap start down / end up to word boundaries, ±pad, clamped to media. */
    public function snap(float $s, float $e, array $words, float $durationS): array
    {
        $s = max(0.0, $s - $this->padS);
        $e = min($durationS, $e + $this->padS);
        $ws = null;
        $we = null;
        foreach ($words as $w) {
            if ($w['s'] <= $s) {
                $ws = $w['s'];
            }
            if ($we === null && $w['e'] >= $e) {
                $we = $w['e'];
            }
        }

        return [max(0.0, $ws ?? $s), min($durationS, $we ?? $e)];
    }

    private function scores(mixed $raw): array
    {
        $g = fn ($k) => min(100, max(0, (int) ((array) $raw)[$k] ?? 50));
        $s = ['hook' => $g('hook'), 'retention' => $g('retention'), 'value' => $g('value'), 'share' => $g('share')];
        $s['total'] = (int) round(0.4 * $s['hook'] + 0.25 * $s['retention'] + 0.2 * $s['value'] + 0.15 * $s['share']);

        return $s;
    }

    /** Drop >50% overlaps and near-duplicate hooks, keeping the higher score. */
    private function dedupe(array $clips): array
    {
        usort($clips, fn ($a, $b) => $b['score_total'] <=> $a['score_total']);
        $kept = [];
        foreach ($clips as $c) {
            $dup = false;
            foreach ($kept as $k) {
                $overlap = max(0.0, min($c['end_s'], $k['end_s']) - max($c['start_s'], $k['start_s']));
                $shorter = min($c['end_s'] - $c['start_s'], $k['end_s'] - $k['start_s']);
                if ($shorter > 0 && $overlap / $shorter > 0.5) {
                    $dup = true;
                    break;
                }
                if ($this->jaccard($c['hook_line'], $k['hook_line']) > 0.8) {
                    $dup = true;
                    break;
                }
            }
            if (! $dup) {
                $kept[] = $c;
            }
        }

        return $kept;
    }

    private function jaccard(string $a, string $b): float
    {
        $wa = array_unique(preg_split('/\s+/', mb_strtolower($a), -1, PREG_SPLIT_NO_EMPTY));
        $wb = array_unique(preg_split('/\s+/', mb_strtolower($b), -1, PREG_SPLIT_NO_EMPTY));
        if ($wa === [] || $wb === []) {
            return 0.0;
        }

        return count(array_intersect($wa, $wb)) / count(array_unique(array_merge($wa, $wb)));
    }
}
