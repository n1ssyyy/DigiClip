<?php

namespace Tests\Feature;

use App\Services\Stt\WhisperCppTranscriber;
use Tests\TestCase;

/**
 * Real end-to-end transcription with the bundled whisper.cpp binary.
 * Skipped when binaries/models are absent (e.g. fresh CI checkout).
 */
class M1TranscribeTest extends TestCase
{
    public function test_transcribes_sample_audio(): void
    {
        $binary = resource_path('bin/linux-x64/whisper-cli');
        $model = storage_path('app/digiclip/models/ggml-base.en.bin');
        $sample = '/tmp/toolchain/whisper.cpp/samples/jfk.wav';

        foreach (['binary' => $binary, 'model' => $model, 'sample' => $sample] as $what => $path) {
            if (! is_file($path)) {
                $this->markTestSkipped("missing {$what} for integration test");
            }
        }

        /** @var WhisperCppTranscriber $stt */
        $stt = app(WhisperCppTranscriber::class);
        $this->assertSame('base.en', $stt->modelId());

        $result = $stt->transcribe($sample, ['out_prefix' => sys_get_temp_dir().'/m1test']);

        $this->assertGreaterThan(5, $result->wordCount());
        $this->assertStringContainsString('fellow Americans', $result->fullText());
        $this->assertSame('en', $result->language);
        // Token-timed words carry confidence; even-split fallback would be all null.
        $confs = array_filter(array_column($result->words, 'conf'), fn ($c) => $c !== null);
        $this->assertNotEmpty($confs);
    }
}
