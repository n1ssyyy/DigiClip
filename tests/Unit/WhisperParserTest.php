<?php

namespace Tests\Unit;

use App\Services\Captions\SrtBuilder;
use App\Services\Stt\WhisperCppTranscriber;
use PHPUnit\Framework\TestCase;

class WhisperParserTest extends TestCase
{
    private function transcriber(): WhisperCppTranscriber
    {
        return new WhisperCppTranscriber(
            $this->createMock(\App\Services\Stt\BinaryManager::class),
            $this->createMock(\App\Services\Stt\ModelManager::class),
        );
    }

    public function test_segments_split_evenly_across_words(): void
    {
        $data = [
            'transcription' => [
                ['timestamps' => ['from' => '00:00:00,000', 'to' => '00:00:04,000'], 'text' => 'hello brave new world'],
            ],
            'result' => ['language' => 'en'],
        ];
        $r = $this->transcriber()->parseOutput($data, 'base.en');

        $this->assertSame(4, $r->wordCount());
        $this->assertSame('hello brave new world', $r->fullText());
        $this->assertSame(0.0, $r->words[0]['s']);
        $this->assertSame(4.0, $r->words[3]['e']);
        $this->assertSame(1.0, $r->words[1]['s']);
        $this->assertNull($r->words[0]['conf']);
        $this->assertSame('base.en', $r->model);
    }

    public function test_ojf_tokens_preferred_over_even_split(): void
    {
        $data = [
            'transcription' => [[
                'timestamps' => ['from' => '00:00:00,000', 'to' => '00:00:01,000'],
                'text' => ' And so',
                'tokens' => [
                    ['text' => '[_BEG_]', 'timestamps' => ['from' => '00:00:00,000', 'to' => '00:00:00,000'], 'id' => 50363, 'p' => 0.84],
                    ['text' => ' And', 'timestamps' => ['from' => '00:00:00,320', 'to' => '00:00:00,370'], 'id' => 843, 'p' => 0.711],
                    ['text' => ' so', 'timestamps' => ['from' => '00:00:00,370', 'to' => '00:00:00,530'], 'id' => 523, 'p' => 0.985],
                ],
            ]],
            'result' => ['language' => 'en'],
        ];
        $r = $this->transcriber()->parseOutput($data);

        $this->assertSame(['And', 'so'], array_column($r->words, 'w'));
        $this->assertSame(0.32, $r->words[0]['s']);
        $this->assertSame(0.53, $r->words[1]['e']);
        $this->assertSame(0.711, $r->words[0]['conf']);
    }

    public function test_empty_segments_skipped(): void
    {
        $r = $this->transcriber()->parseOutput(['transcription' => [['timestamps' => [], 'text' => '  ']]]);

        $this->assertSame(0, $r->wordCount());
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('stamps')]
    public function test_to_seconds(string $in, float $expected): void
    {
        $this->assertSame($expected, WhisperCppTranscriber::toSeconds($in));
    }

    public static function stamps(): array
    {
        return [
            ['00:00:00,000', 0.0],
            ['00:00:04,500', 4.5],
            ['00:05:12,340', 312.34],
            ['01:00:00,000', 3600.0],
        ];
    }

    public function test_srt_groups_and_stamps(): void
    {
        $words = [
            ['w' => 'hello', 's' => 0.0, 'e' => 0.5, 'conf' => null],
            ['w' => 'world', 's' => 0.6, 'e' => 1.0, 'conf' => null],
        ];
        $srt = (new SrtBuilder)->fromWords($words);

        $this->assertStringContainsString("1\n00:00:00,000 --> 00:00:01,000\nhello world", $srt);
    }
}
