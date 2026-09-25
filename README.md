<p align="center">
  <h1 align="center">DigiClip</h1>
</p>

<p align="center">
  <strong>Drop a video, get TikTok-ready clips.</strong><br />
  Offline-first desktop app that transcribes long-form video, finds the moments worth posting,
  and renders captioned 9:16 clips — no cloud render farm required.
</p>

<p align="center">
  <a href="https://github.com/n1ssyyy/DigiClip/actions/workflows/ci.yml">
    <img src="https://shieldcn.dev/github/n1ssyyy/DigiClip/ci.svg?variant=default&size=default" alt="CI" />
  </a>
  <a href="https://github.com/n1ssyyy/DigiClip/releases/latest">
    <img src="https://shieldcn.dev/github/n1ssyyy/DigiClip/release.svg?variant=default&size=default" alt="Latest Release" />
  </a>
  <a href="https://github.com/n1ssyyy/DigiClip/blob/main/LICENSE">
    <img src="https://shieldcn.dev/github/n1ssyyy/DigiClip/license.svg?variant=default&size=default" alt="MIT License" />
  </a>
</p>

<p align="center">
  <img src="https://shieldcn.dev/badge/Tauri-2-FFC131.svg?logo=tauri&variant=default&size=default" alt="Tauri 2" />
  <img src="https://shieldcn.dev/badge/Rust-Stable-CE422B.svg?logo=rust&variant=default&size=default" alt="Rust" />
  <img src="https://shieldcn.dev/badge/React-19-61DAFB.svg?logo=react&variant=default&size=default" alt="React 19" />
  <img src="https://shieldcn.dev/badge/Tailwind-4-06B6D4.svg?logo=tailwindcss&variant=default&size=default" alt="Tailwind 4" />
</p>

<p align="center">
  <img src="https://shieldcn.dev/badge/whisper.cpp-STT-000000.svg?logo=huggingface&variant=default&size=default" alt="whisper.cpp" />
  <img src="https://shieldcn.dev/badge/OpenRouter-LLM-000000.svg?logo=openrouter&variant=default&size=default" alt="OpenRouter" />
  <img src="https://shieldcn.dev/badge/ffmpeg-Render-00A8E8.svg?logo=ffmpeg&variant=default&size=default" alt="ffmpeg" />
</p>

<p align="center">
  <a href="https://github.com/n1ssyyy"><img src="https://shieldcn.dev/badge/Author-n1ssyyy-181717.svg?logo=github&variant=default&size=default" alt="n1ssyyy" /></a>
  <a href="https://github.com/n1ssyyy/DigiClip-CLI"><img src="https://shieldcn.dev/badge/Engine-DigiClip_CLI-1e40af.svg?logo=github&variant=default&size=default" alt="DigiClip CLI engine" /></a>
</p>

---

DigiClip turns long videos into captioned vertical clips on your own machine. The clipping itself is done by the [DigiClip CLI](https://github.com/n1ssyyy/DigiClip-CLI) engine (the `engine/` submodule); this repo is the desktop app and its installer.

## ✨ What it does

- **Drop a video, get clips** — `.mp4`, `.mov`, `.mkv`, `.webm`, `.m4a`, straight off your disk.
- **Offline transcription** — whisper.cpp with word-level timing; no Python, no cloud STT.
- **Smart picks** — an [OpenRouter](https://openrouter.ai) model of your choice scores the best moments (bring your own key), with an offline fallback.
- **Speaker autofocus** — the 9:16 crop follows whoever is talking.
- **Ready to post** — 1080×1920 H.264, 8 caption styles, loudness-normalized audio, upload kits; clips render in parallel, GPU-encoded when available.
- **Private** — video, transcripts and renders never leave your machine; only clip scoring optionally calls OpenRouter.

## 📥 Install

Download the **DigiClip Setup** for your system from the [latest release](https://github.com/n1ssyyy/DigiClip/releases/latest). The app is inside the installer, so no internet is needed to install; run the same Setup again to update, repair or uninstall.

| System | Download |
|---|---|
| Windows 10/11 (x64) | `DigiClip-Setup-Windows-x64.exe` |
| macOS (Apple Silicon) | `DigiClip-Setup-macOS-arm64.zip` → unzip → open **DigiClip Setup** |
| Linux x86_64 (Ubuntu 24.04+, Fedora 40+, Debian 13+) | `DigiClip-Setup-Linux-x86_64.AppImage` → `chmod +x` → run |

The installers aren't code-signed yet: on Windows choose **More info → Run anyway**, on macOS **System Settings → Privacy & Security → Open Anyway**. Once installed, the app checks for updates itself and hands them to Setup.

## 🧭 How it works

The Tauri shell starts the engine as `digiclip --serve` and the React UI talks to it over a token-gated localhost WebSocket. The engine runs each job — extract audio → transcribe → pick clips → track the speaker → render — and streams progress back live. Jobs and settings live in your user-data folder, so nothing is lost on restart.

**Stack:** Tauri 2 · React 19 · Tailwind 4 · Rust engine (whisper.cpp, ONNX Runtime, ffmpeg, axum).

## 🛠 Development

Needs Node 22, Rust stable, the engine's C++ build tools ([engine README](https://github.com/n1ssyyy/DigiClip-CLI#-building)), and ffmpeg with libass.

```bash
git clone --recurse-submodules https://github.com/n1ssyyy/DigiClip.git
cd DigiClip
(cd engine && cargo build --release)   # the engine
npm install
npm run tauri dev                      # the app (finds engine/target automatically)
```

`DIGICLIP_BIN=/path/to/digiclip` points the app at any engine build. The installer lives in `setup/` (`cd setup && npm install && npm run tauri dev`).

## ⚙️ Configuration

Everything is set in the app's **Settings** page (OpenRouter key and model, transcription model, clip count, caption style, tightening, punch-ins). The key stays in the engine's local `settings.json`.

| Variable | What it does |
|---|---|
| `OPENROUTER_API_KEY` | Key for LLM clip scoring; without one the offline scorer is used. |
| `OPENROUTER_MODEL` | Scoring model (default `nvidia/nemotron-3-ultra-550b-a55b:free`). |
| `DIGICLIP_BIN` | Dev: explicit engine binary. |

## 🚢 Releases

CI builds, installs and launch-tests the app on Windows, macOS and Linux for every push. Tagging `v*` publishes exactly three files — one DigiClip Setup per platform, each with the app embedded.

```bash
git submodule update --remote engine && git commit -am "chore: bump engine"
git tag v2.3.4 && git push origin main v2.3.4   # tag must match src-tauri/tauri.conf.json
```

## 🩺 Troubleshooting

| Problem | Fix |
|---|---|
| Something fails in a job | Open the **Health** page — it shows exactly what the engine found (ffmpeg, libass, encoder, models, GPU). |
| `ffmpeg not found` | Windows downloads it automatically. macOS: `brew install ffmpeg`. Linux: `sudo apt install ffmpeg`. |
| Linux Setup won't start | No FUSE on the system: run it with `--appimage-extract-and-run`. |
| Empty `engine/` after cloning | `git submodule update --init --recursive` |

## 📄 License

MIT — see `LICENSE`. Video you process stays yours and stays local.

## 🙏 Acknowledgements

Developed by [n1ssyyy](https://github.com/n1ssyyy) in collaboration with
[Shkolla Digjitale](https://shkolladigjitale.com/) (Prizren).

Built on Tauri · React · whisper.cpp · ffmpeg · ONNX Runtime · OpenRouter.
Engine: [DigiClip CLI](https://github.com/n1ssyyy/DigiClip-CLI).
