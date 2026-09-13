# Bundled media binaries

`App\Services\Stt\BinaryManager` resolves `ffmpeg`, `ffprobe` and `whisper-cli`
in this order:

1. `resources/bin/<platform>/` in this repo (checked in, ships with the app)
2. System `PATH` (developer machine / user install)

Platform dirs:

| Dir | Status |
|-----|--------|
| `linux-x64/` | ✅ `ffmpeg`, `ffprobe`, `whisper-cli` bundled |
| `linux-arm64/` | ⏳ empty — drop the three binaries here |
| `mac-x64/` / `mac-arm64/` | ⏳ empty — same |
| `win-x64/` | ⏳ empty — same (`whisper-cli.exe`, `ffmpeg.exe`, `ffprobe.exe`) |

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
with a progress ring, or prefetch from a terminal:

```bash
php artisan digiclip:provision-media          # default model only
php artisan digiclip:provision-media --all    # every known model
```

`/api/health` reports exactly which binaries resolved — check there first
when a job fails with "not found".
