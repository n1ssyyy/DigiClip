# Bundled media binaries

`App\Services\Stt\BinaryManager` resolves `ffmpeg`, `ffprobe` and `whisper-cli`
in this order:

1. `resources/bin/<platform>/` in this repo (checked in, ships with the app)
2. System `PATH` (developer machine / user install)

Platform dirs:

| Dir | Status |
|-----|--------|
| `linux-x64/` | ✅ `ffmpeg`, `ffprobe`, `whisper-cli` (CPU) + `whisper-cli-vulkan` (GPU, static, 52MB) bundled |
| `linux-arm64/` | ⏳ empty — drop the binaries here |
| `mac-x64/` / `mac-arm64/` | ⏳ empty — same (no GPU sidecar yet: toggle stays off with the reason) |
| `win-x64/` | ✅ built in CI (`ffmpeg.exe`, `ffprobe.exe`, `whisper-cli.exe`, `whisper-cli-vulkan.exe`) — empty in git |

GPU sidecar: whisper.cpp @ `927cfce` (v1.9.4-dev) with `-DGGML_VULKAN=1
-DBUILD_SHARED_LIBS=OFF`. Static link keeps it a single file (only the
system Vulkan loader is needed, which ships with GPU drivers). Rebuild:

```bash
git clone https://github.com/ggerganov/whisper.cpp /tmp/whisper.cpp
git -C /tmp/whisper.cpp checkout 927cfce34f31707e17f2bff35c349632fb9e2c3a
cmake -S /tmp/whisper.cpp -B /tmp/whisper.cpp/build \
  -DGGML_VULKAN=1 -DBUILD_SHARED_LIBS=OFF -DCMAKE_BUILD_TYPE=Release
cmake --build /tmp/whisper.cpp/build -j4 --target whisper-cli --config Release
cp /tmp/whisper.cpp/build/bin/whisper-cli resources/bin/linux-x64/whisper-cli-vulkan
```

Needs `libvulkan-dev` + `glslang-tools` (glslc) on Debian/Ubuntu, or the
Vulkan SDK on Windows (preinstalled on the CI runners). This whisper.cpp
release uses `-ng` / `-dev N` for GPU control (not the older `-ngl`).

Where to get them:

- **ffmpeg / ffprobe** — https://www.gyan.dev/ffmpeg/builds (Windows),
  https://evermeet.cx/ffmpeg (macOS), or distro packages / https://johnvansickle.com/ffmpeg (Linux).
  Must include **libass** (`ffmpeg -filters | grep ass`) or caption burn-in fails.
- **whisper-cli** — build from https://github.com/ggerganov/whisper.cpp
  (`cmake -B build && cmake --build build -j --config Release`, binary at
  `build/bin/whisper-cli`), or download a release asset.

Whisper **models** (`ggml-*.bin`, 75 MB–3 GB) live in `storage/app/digiclip/models/`
(gitignored user-data). `base.en` (142 MB) ships **inside the installers**:
CI fetches it into `resources/models/` at build time (too big for git —
GitHub caps files at 100 MB) and the app seeds it to user storage on first
boot, so transcription works out of the box with zero setup. Bigger models
stay on demand — pick one in Settings and it downloads in the background
with a progress ring, or prefetch from a terminal. Anything on disk can be
removed again from the same picker (trash button, far right — two clicks to
confirm); deleting the active model is safe, it re-fetches on next run.

```bash
php artisan digiclip:provision-media          # default model only
php artisan digiclip:provision-media --all    # every known model
```

`/api/health` reports exactly which binaries resolved — check there first
when a job fails with "not found".
