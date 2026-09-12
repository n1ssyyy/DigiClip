<?php

namespace App\Services\Stt;

readonly class TranscriptionResult
{
    public function __construct(
        public array $words,
        public array $segments,
        public string $language,
        public string $model,
        public float $audioDurationS = 0.0,
    ) {}

    public function fullText(): string
    {
        return implode(' ', array_column($this->words, 'w'));
    }

    public function wordCount(): int
    {
        return count($this->words);
    }
}
