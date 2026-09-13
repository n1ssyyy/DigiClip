<?php

namespace Tests\Feature;

use App\Services\System\GpuDetector;
use Tests\TestCase;

class GpuDetectorTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // detect()/vulkanDevices() cache for an hour: flush so each test's
        // fake runner outputs are actually exercised, not a stale entry.
        \Illuminate\Support\Facades\Cache::flush();
    }

    private function detectorFor(array $outputs): GpuDetector
    {
        return new GpuDetector(function ($cmd) use ($outputs) {
            foreach ($outputs as $needle => $out) {
                if (str_contains($cmd, $needle)) {
                    return $out;
                }
            }

            return null;
        });
    }

    public function test_nvidia_smi_lists_discrete_with_vram(): void
    {
        $d = $this->detectorFor([
            'nvidia-smi' => "NVIDIA GeForce RTX 3050 Laptop GPU, 4096\nNVIDIA GeForce RTX 4070, 12288\n",
        ]);

        $gpus = $d->fromNvidiaSmi();
        $this->assertCount(2, $gpus);
        $this->assertSame(12288, $gpus[1]['memory_mb']);
        $this->assertTrue($gpus[0]['discrete']);
    }

    public function test_best_pick_prefers_discrete_then_vram(): void
    {
        $d = $this->detectorFor([
            'nvidia-smi' => "NVIDIA GeForce RTX 4070, 12288\n",
            'lspci' => "\"00:02.0\" \"VGA compatible controller\" \"Intel Corporation\" \"Alder Lake-P GT2 [Iris Xe Graphics]\"\n",
        ]);

        // lspci only runs on Linux; force both sources regardless of OS.
        $ranked = $d->rank([...$d->fromNvidiaSmi(), ...$d->fromLspci()]);
        $this->assertSame('NVIDIA GeForce RTX 4070', $ranked[0]['name']);
        $this->assertStringContainsString('Iris Xe', $ranked[1]['name']);
        $this->assertFalse($ranked[1]['discrete']);
    }

    public function test_lspci_marks_3d_controllers_discrete(): void
    {
        $d = $this->detectorFor([
            'lspci' => "\"01:00.0\" \"3D controller\" \"NVIDIA Corporation\" \"GA107M [GeForce RTX 3050 Mobile]\"\n\"05:00.0\" \"VGA compatible controller\" \"Advanced Micro Devices, Inc. [AMD/ATI]\" \"Cezanne [Radeon Vega Series]\"\n",
        ]);

        $gpus = $d->fromLspci();
        $this->assertCount(2, $gpus);
        $this->assertSame('GA107M [GeForce RTX 3050 Mobile]', $gpus[0]['name']);
        $this->assertTrue($gpus[0]['discrete']);
        $this->assertFalse($gpus[1]['discrete']);
    }

    public function test_wmi_parses_and_caps_overflowed_vram(): void
    {
        $d = $this->detectorFor([
            'powershell' => '[{"Name":"NVIDIA GeForce RTX 4060","AdapterRAM":4294967295},{"Name":"Intel(R) UHD Graphics","AdapterRAM":134217728}]',
        ]);

        $gpus = $d->fromWmi();
        $this->assertCount(2, $gpus);
        $this->assertTrue($gpus[0]['discrete']);
        $this->assertNull($gpus[0]['memory_mb']); // uint32 saturation
        $this->assertSame(128, $gpus[1]['memory_mb']);
    }

    public function test_no_gpu_anywhere_means_unavailable(): void
    {
        $d = $this->detectorFor([]);

        $this->assertSame([], $d->probe());
        $this->assertNull($d->best());
        $this->assertFalse($d->available());
    }

    public function test_failing_commands_degrade_to_empty(): void
    {
        $d = new GpuDetector(fn () => throw new \RuntimeException('nope'));

        $this->assertSame([], $d->probe());
    }

    public function test_vulkan_devices_parse_loader_order(): void
    {
        $d = $this->detectorFor([
            'vulkan-probe' => "ggml_vulkan: Found 2 Vulkan devices:\n"
                ."ggml_vulkan: 0 = AMD Radeon Graphics (RADV RENOIR) (radv) | uma: 1 | fp16: 1\n"
                ."ggml_vulkan: 1 = NVIDIA GeForce RTX 3050 Laptop GPU (NVIDIA) | uma: 0 | fp16: 1\n",
        ]);

        $devices = $d->vulkanDevices('/opt/whisper-cli-vulkan', '/m.bin');
        $this->assertCount(2, $devices);
        $this->assertSame(0, $devices[0]['index']);
        $this->assertSame(1, $devices[1]['index']);
        $this->assertStringContainsString('RTX 3050', $devices[1]['name']);
    }

    public function test_preferred_vulkan_index_picks_best_gpu(): void
    {
        $d = $this->detectorFor([
            // Best detector GPU: discrete NVIDIA (nvidia-smi), plus an iGPU.
            'nvidia-smi' => "NVIDIA GeForce RTX 3050 Laptop GPU, 4096\n",
            'lspci' => "\"05:00.0\" \"VGA compatible controller\" \"Advanced Micro Devices, Inc. [AMD/ATI]\" \"Cezanne [Radeon Vega Series]\"\n",
            'vulkan-probe' => "ggml_vulkan: 0 = AMD Radeon Graphics (RADV RENOIR) (radv) | uma: 1\n"
                ."ggml_vulkan: 1 = NVIDIA GeForce RTX 3050 Laptop GPU (NVIDIA) | uma: 0\n",
        ]);

        // nvidia-smi (discrete, 4GB) must outrank the lspci iGPU.
        $this->assertStringContainsString('RTX 3050', $d->best()['name']);
        $this->assertSame(1, $d->preferredVulkanIndex('/opt/whisper-cli-vulkan', '/m.bin'));
    }

    public function test_preferred_vulkan_index_null_when_no_confident_match(): void
    {
        $d = $this->detectorFor([
            'nvidia-smi' => "NVIDIA GeForce RTX 3050 Laptop GPU, 4096\n",
            // Probe lists totally unrelated hardware: no match allowed.
            'vulkan-probe' => "ggml_vulkan: 0 = Some Mystery Accelerator XYZ 9000 (foo) | uma: 1\n",
        ]);

        $this->assertNull($d->preferredVulkanIndex('/opt/whisper-cli-vulkan', '/m.bin'));
    }

    public function test_vulkan_probe_missing_binary_returns_empty(): void
    {
        $d = new GpuDetector(fn () => throw new \RuntimeException('should not be called'));

        $this->assertSame([], $d->vulkanDevices('/nonexistent/whisper-cli-vulkan', '/nonexistent.bin'));
        $this->assertNull($d->preferredVulkanIndex('/nonexistent/whisper-cli-vulkan', '/nonexistent.bin'));
    }

    public function test_probe_wav_is_valid_16khz_mono_silence(): void
    {
        // Regression: a malformed pack() format made probeWav() throw, so
        // every real Vulkan probe failed and -dev was never passed.
        $path = GpuDetector::probeWav();

        $this->assertFileExists($path);
        $this->assertSame(44 + 32000, filesize($path));
        $head = file_get_contents($path, false, null, 0, 44);
        $this->assertSame('RIFF', substr($head, 0, 4));
        $this->assertSame('WAVEfmt ', substr($head, 8, 8));
        $this->assertSame(1, unpack('v', substr($head, 20, 2))[1]); // PCM
        $this->assertSame(1, unpack('v', substr($head, 22, 2))[1]); // mono
        $this->assertSame(16000, unpack('V', substr($head, 24, 4))[1]); // rate
    }
}
