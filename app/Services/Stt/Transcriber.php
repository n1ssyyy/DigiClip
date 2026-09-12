<?php

namespace App\Services\Stt;

/**
 * Local speech-to-text seam (PLAN.MD §5).
 * Implementations must run fully offline with word-level timestamps.
 */
interface Transcriber
{
    /**
     * @return TranscriptionResult words[] = [{w: string, s: float, e: float, conf: ?float}]
     */
    public function transcribe(string $wavPath, array $options = []): TranscriptionResult;

    public function modelId(): string;
}
