<?php

namespace Tests\Unit;

use App\Services\Stt\BinaryManager;
use App\Services\Stt\ModelManager;
use App\Services\Stt\WhisperCppTranscriber;
use App\Services\System\GpuDetector;
use PHPUnit\Framework\TestCase;

class WhisperGpuTest extends TestCase
{
    private function transcriber(?string $vulkan, ?string $cpu): WhisperCppTranscriber
    {
        $binaries = $this->createMock(BinaryManager::class);
        $binaries->method('resolve')->willReturnCallback(
            fn ($name) => $name === 'whisper-cli-vulkan' ? $vulkan : $cpu
        );
        $models = $this->createMock(ModelManager::class);

        return new WhisperCppTranscriber($binaries, $models);
    }

    public function test_gpu_prefers_vulkan_sidecar(): void
    {
        $t = $this->transcriber('/opt/whisper-cli-vulkan', '/opt/whisper-cli');

        $this->assertSame('/opt/whisper-cli-vulkan', $t->pickBinary(true));
        $this->assertSame('/opt/whisper-cli', $t->pickBinary(false));
    }

    public function test_gpu_falls_back_to_cpu_binary_when_vulkan_missing(): void
    {
        $t = $this->transcriber(null, '/opt/whisper-cli');

        $this->assertSame('/opt/whisper-cli', $t->pickBinary(true));
    }

    public function test_enabled_defaults_to_auto_detect(): void
    {
        $withGpu = new GpuDetector(fn () => "NVIDIA GeForce RTX 3050 Laptop GPU, 4096\n");
        $withoutGpu = new GpuDetector(fn () => null);

        $this->assertTrue($withGpu->enabled(null));
        $this->assertFalse($withoutGpu->enabled(null));
        $this->assertTrue($withoutGpu->enabled('1'));
        $this->assertFalse($withGpu->enabled('0'));
        $this->assertFalse($withGpu->enabled(false));
    }

    public function test_cpu_count_is_sane_everywhere(): void
    {
        $t = $this->transcriber(null, null);

        $this->assertGreaterThanOrEqual(1, $t->cpuCount());
    }

    public function test_cpu_command_uses_no_gpu_flag_and_never_ngl(): void
    {
        $t = $this->transcriber(null, '/opt/whisper-cli');
        $cmd = $t->buildCommand('/opt/whisper-cli', '/m.bin', '/a.wav', 'en', '/tmp/out', 4, false);

        $this->assertContains('-ng', $cmd);
        $this->assertNotContains('-ngl', $cmd);
        $this->assertNotContains('-dev', $cmd);
    }

    public function test_vulkan_command_omits_ng_and_passes_dev_index(): void
    {
        $t = $this->transcriber('/opt/whisper-cli-vulkan', '/opt/whisper-cli');
        $cmd = $t->buildCommand('/opt/whisper-cli-vulkan', '/m.bin', '/a.wav', 'en', '/tmp/out', 4, true, 1);

        $this->assertNotContains('-ng', $cmd);
        $this->assertNotContains('-ngl', $cmd);
        $this->assertContains('-dev', $cmd);
        $this->assertSame('1', $cmd[array_search('-dev', $cmd) + 1]);
    }

    public function test_vulkan_command_without_index_omits_dev(): void
    {
        $t = $this->transcriber('/opt/whisper-cli-vulkan', '/opt/whisper-cli');
        $cmd = $t->buildCommand('/opt/whisper-cli-vulkan', '/m.bin', '/a.wav', 'en', '/tmp/out', 4, true, null);

        $this->assertNotContains('-ng', $cmd);
        $this->assertNotContains('-dev', $cmd);
    }
}
