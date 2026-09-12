<?php

namespace Tests\Unit;

use App\Services\Captions\AssBuilder;
use PHPUnit\Framework\TestCase;

class AssBuilderTest extends TestCase
{
    private function words(): array
    {
        // 8 half-second words.
        $text = ['and', 'so', 'my', 'fellow', 'americans', 'ask', 'not', 'today'];
        $out = [];
        foreach ($text as $i => $w) {
            $out[] = ['w' => $w, 's' => $i * 0.5, 'e' => $i * 0.5 + 0.4, 'conf' => 0.9];
        }

        return $out;
    }

    public function test_groups_by_words_and_chars(): void
    {
        // "and so my fellow" (15 chars) fits; "americans" would break 20 chars.
        $lines = (new AssBuilder)->group($this->words());

        $this->assertCount(3, $lines);
        $this->assertSame(['and', 'so', 'my', 'fellow'], array_column($lines[0], 'w'));
        $this->assertSame(['americans', 'ask', 'not'], array_column($lines[1], 'w'));
        $this->assertSame(['today'], array_column($lines[2], 'w'));
    }

    public function test_splits_on_pause(): void
    {
        $words = $this->words();
        foreach ([4, 5, 6, 7] as $i) {
            $words[$i]['s'] += 5.0;
            $words[$i]['e'] += 5.0;
        }
        $lines = (new AssBuilder)->group($words);

        $this->assertCount(3, $lines);
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('presets')]
    public function test_all_presets_build_valid_ass(string $preset): void
    {
        $ass = (new AssBuilder)->build($this->words(), $preset);

        $this->assertStringContainsString('PlayResX: 1080', $ass);
        $this->assertStringContainsString('PlayResY: 1920', $ass);
        // tiktok/karaoke/hormozi budget (3 words): line 1 = and/so/my → 1.40s.
        // minimal (4w/20ch): line 1 = and/so/my/fellow → 1.90s.
        $end = $preset === 'minimal' ? '0:00:01.90' : '0:00:01.40';
        $this->assertStringContainsString("Dialogue: 0,0:00:00.00,{$end},", $ass);
        $this->assertStringContainsString($preset === 'minimal' ? '{\\k40}and' : '{\\k40}AND', $ass); // 0.4s → 40cs
    }

    public static function presets(): array
    {
        return [['tiktok'], ['karaoke'], ['hormozi'], ['minimal']];
    }

    public function test_tiktok_budget_keeps_lines_short(): void
    {
        [$maxWords, $maxChars] = \App\Services\Captions\AssBuilder::LINE_BUDGETS['tiktok'];
        $lines = (new AssBuilder)->group($this->words(), $maxWords, $maxChars);

        $this->assertSame(['and', 'so', 'my'], array_column($lines[0], 'w'));
        foreach ($lines as $line) {
            $this->assertLessThanOrEqual($maxWords, count($line));
            $this->assertLessThanOrEqual($maxChars, mb_strlen(implode(' ', array_column($line, 'w'))));
        }
    }

    public function test_minimal_keeps_case(): void
    {
        $ass = (new AssBuilder)->build([['w' => 'Hello', 's' => 0.0, 'e' => 0.5, 'conf' => null]], 'minimal');

        $this->assertStringContainsString('{\\k50}Hello', $ass);
    }

    public function test_unknown_preset_falls_back_to_tiktok(): void
    {
        $ass = (new AssBuilder)->build($this->words(), 'nope');

        $this->assertStringContainsString('Style: Tiktok,', $ass);
    }

    public function test_stamp_format(): void
    {
        $this->assertSame('0:00:00.00', AssBuilder::stamp(0.0));
        $this->assertSame('0:05:04.20', AssBuilder::stamp(304.2));
        $this->assertSame('1:00:00.00', AssBuilder::stamp(3600.0));
    }
}
