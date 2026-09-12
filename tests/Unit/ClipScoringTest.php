<?php

namespace Tests\Unit;

use App\Services\Clips\ClipPrompt;
use App\Services\Clips\ClipValidator;
use App\Services\Clips\HeuristicScorer;
use PHPUnit\Framework\TestCase;

class ClipScoringTest extends TestCase
{
    private function words(): array
    {
        // 60 one-second words: "word0" … "word59".
        $out = [];
        for ($i = 0; $i < 60; $i++) {
            $out[] = ['w' => "word{$i}", 's' => (float) $i, 'e' => (float) $i + 0.8, 'conf' => 0.9];
        }

        return $out;
    }

    public function test_snaps_to_word_boundaries_and_ranks(): void
    {
        $v = new ClipValidator(minS: 5.0, maxS: 90.0);
        $raw = [
            ['start_s' => 10.4, 'end_s' => 30.6, 'hook_line' => 'Why startups fail fast',
                'scores' => ['hook' => 90, 'retention' => 80, 'value' => 70, 'share' => 60],
                'title' => 'Fail fast', 'hashtags' => ['startups'], 'caption_style' => 'hormozi'],
            ['start_s' => 12.0, 'end_s' => 28.0, 'hook_line' => 'Why startups fail fast',
                'scores' => ['hook' => 50, 'retention' => 50, 'value' => 50, 'share' => 50]],
            ['start_s' => 1000.0, 'end_s' => 1001.0], // out of range → dropped
            ['nope' => true], // invalid → dropped
        ];
        $clips = $v->normalize($raw, $this->words(), 60.0, 3);

        $this->assertCount(1, $clips); // overlap dupe absorbed, bad ones dropped
        $this->assertSame(10.0, $clips[0]['start_s']); // snapped down 10.15→10
        $this->assertSame(31.8, $clips[0]['end_s']);   // snapped up 30.85→31.8
        $this->assertSame(1, $clips[0]['rank']);
        $this->assertSame(79, $clips[0]['score_total']); // .4*90+.25*80+.2*70+.15*60
        $this->assertSame('hormozi', $clips[0]['caption_style']);
        $this->assertSame(['#startups'], $clips[0]['hashtags']);
    }

    public function test_rejects_too_short(): void
    {
        $v = new ClipValidator(minS: 15.0);
        $this->assertSame([], $v->normalize(
            [['start_s' => 1.0, 'end_s' => 3.0, 'hook_line' => 'x']],
            $this->words(), 60.0, 3
        ));
    }

    public function test_heuristic_proposes_windows(): void
    {
        $words = [];
        $t = 0.0;
        foreach (explode(' ', 'What if everything you know about startups is wrong ? Investors never tell you this secret !') as $w) {
            $words[] = ['w' => $w, 's' => $t, 'e' => $t + 0.5, 'conf' => null];
            $t += 0.6;
        }
        // Pad with filler to allow 20s+ windows.
        for ($i = 0; $i < 60; $i++) {
            $words[] = ['w' => 'filler', 's' => $t, 'e' => $t + 0.5, 'conf' => null];
            $t += 0.6;
        }
        $raw = (new HeuristicScorer)->propose($words, 2);

        $this->assertNotEmpty($raw);
        $this->assertStringContainsString('question hook', $raw[0]['why_it_works']);
    }

    public function test_prompt_stays_in_budget_and_stamps(): void
    {
        $this->assertSame('05:04', ClipPrompt::stamp(304.2));
        $user = ClipPrompt::user(
            $this->words(),
            [
                ['s' => 0.0, 'e' => 30.0, 'text' => str_repeat('ab ', 280)],
                ['s' => 30.0, 'e' => 60.0, 'text' => str_repeat('cd ', 280)],
            ],
            60.0, 1000
        );
        $this->assertLessThanOrEqual(1100, strlen($user));
        $this->assertStringContainsString('truncated', $user);
        $this->assertStringContainsString('[00:00]', $user);
    }
}
