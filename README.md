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

> **Engine:** the clipping pipeline lives in `engine/` — a git submodule
> pinned to the [DigiClip CLI](https://github.com/n1ssyyy/DigiClip-CLI) repo.
> The app shell spawns it as `digiclip --serve` and talks to it over a
> token-gated localhost WebSocket. Prefer the terminal? Use the CLI directly.

## ✨ Features

- **Drag-and-drop ingest** — `.mp4`, `.mov`, `.mkv`, `.webm`, `.m4a` (native file picker + window drop).
- **Offline transcription** — whisper.cpp embedded in the engine (`tiny.en` → `large-v3`) with word-level timestamps. No Python, no torch, no API bill for STT.
- **Smart clip picking** — bring-your-own-key [OpenRouter](https://openrouter.ai) LLM scores viral moments (hook, payoff, self-containment), with an offline heuristic fallback when no key is set.
- **Speaker autofocus** — face-tracked 9:16 crop that follows whoever is talking (YuNet + mouth-motion signal, group two-shot framing, shot-cut snaps).
- **Vertical renders** — 1080×1920 H.264 + faststart, center-crop 9:16, loudness-normalized mobile audio (`loudnorm`), hardware encoder auto-pick (NVENC / VideoToolbox / libx264).
- **8 caption presets** — `tiktok`, `karaoke`, `hormozi`, `minimal`, `beast`, `neon`, `highlight`, `ghost`, burned in via libass (plus downloadable `.srt` + upload kits).
- **Live UI, no refresh buttons** — jobs, clip progress, models and health stream over one WebSocket; reconnects resync via `hello` → `snapshot`.
- **Queue-resilient pipeline** — cancel, retry, remove; failed jobs report inline with toasts.
- **Desktop-native** — [Tauri v2](https://tauri.app) shell (frameless dark-first UI, native window controls, reveal-in-file-manager, OS browser links).
- **Private by default** — video, transcripts and renders stay in the OS user-data dir + job folders; only clip *scoring* optionally calls OpenRouter.

## 🧭 How it works

```mermaid
flowchart LR
    Drop(["Drop video"]) --> Shell["Tauri shell\nspawns engine"]
    Shell --> Serve["digiclip --serve\nlocalhost daemon"]
    Serve --> Extract["Extract audio\nffmpeg · 16 kHz mono"]
    Extract --> Transcribe["Transcribe\nwhisper embedded"]
    Transcribe --> Analyze["Pick clips\nLLM or heuristic"]
    Analyze --> Track["Track speaker\nYuNet smart framing"]
    Track --> Render["Render vertical\nffmpeg · 1080x1920"]
    Render --> UI["Live UI\nWebSocket events"]
```

1. The shell locates the engine (`$DIGICLIP_BIN`, bundled `resources/`, or the `engine/` dev build), boots `digiclip --serve --port … --token …`, and publishes `{port, token}` to the webview.
2. The React UI connects to `ws://127.0.0.1:{port}/ws`, sends `{id, cmd, …}` commands (`job_start`, `settings_set`, `models_download`, …) and renders `{type: "ev"}` push events. Video/poster playback streams from `/art` + `/src` (token-gated, Range seeks).
3. The engine runs the full pipeline per job (extract → transcribe → pick → track → render) and persists jobs under the OS user-data dir, so restarts resume.

## 🛠 Tech stack

| Layer    | Choice |
|----------|--------|
| Shell    | Tauri 2 (Rust): sidecar boot, window controls, file dialogs, reveal/open-url |
| UI       | React 19 + Tailwind 4 (dark-first), single-WebSocket store (no polling) |
| Engine   | `engine/` submodule → [DigiClip CLI](https://github.com/n1ssyyy/DigiClip-CLI) (Rust: whisper-rs, ONNX YuNet, ffmpeg, axum) |
| Realtime | Token-gated localhost WebSocket (`/ws`) + artifact HTTP (`/art`, `/src`) |
| Data     | OS user-data dir + per-job folders (`job.json` snapshots); no database |

## 🚀 Getting started

### Install (users)

Grab the **DigiClip Setup** for your system from the
[latest release](https://github.com/n1ssyyy/DigiClip/releases/latest) — it's
the only thing the release ships, one per platform, with the app inside:

| System | Download |
|---|---|
| Windows 10/11 (x64) | `DigiClip-Setup-Windows-x64.exe` |
| macOS (Apple Silicon) | `DigiClip-Setup-macOS-arm64.zip` → unzip → open **DigiClip Setup** |
| Linux x86_64 (glibc 2.39+: Ubuntu 24.04+, Fedora 40+, Debian 13+) | `DigiClip-Setup-Linux-x86_64.AppImage` → `chmod +x` → run (no FUSE? add `--appimage-extract-and-run`) |

Neither installer is code-signed yet: Windows SmartScreen needs **More
info → Run anyway**, macOS needs **System Settings → Privacy & Security →
Open Anyway** on first launch.

### Prerequisites (development)

- Node **22** + npm
- Rust **stable** (+ C++ build tools for the engine's whisper-rs — see the [engine README](https://github.com/n1ssyyy/DigiClip-CLI#getting-started))
- ffmpeg on `PATH` **with libass** (Windows: the engine auto-downloads a portable build; macOS `brew install ffmpeg`; Linux `sudo apt install ffmpeg`)
- Git with submodule support

### Checkout (submodule!)

```bash
git clone --recurse-submodules https://github.com/n1ssyyy/DigiClip.git
cd DigiClip
# already cloned without flags?
git submodule update --init --recursive
```

> **Maintainer, once:** push
> [DigiClip CLI](https://github.com/n1ssyyy/DigiClip-CLI) first, then wire it:
> ```bash
> git submodule add https://github.com/n1ssyyy/DigiClip-CLI.git engine
> git add .gitmodules engine && git commit -m "chore: pin engine submodule"
> ```
> Later engine updates are one line: `git submodule update --remote engine`,
> then commit the new pin. Until the submodule is wired, the shell falls back
> to a sibling `../digiclip-rs` checkout or `$DIGICLIP_BIN` (see Dev loop).

### Dev loop

```bash
# terminal 1 — engine (from the submodule)
cargo build --release --manifest-path engine/Cargo.toml
# or: cargo run --manifest-path engine/Cargo.toml -- --help

# terminal 2 — app
npm install
npm run tauri dev
```

The shell finds the engine automatically: `$DIGICLIP_BIN` override first,
then bundled `resources/`, then `engine/target/{debug,release}/digiclip(.exe)`
(submodule) or the sibling `../digiclip-rs` checkout. To point at a custom
engine binary: `DIGICLIP_BIN=/path/to/digiclip npm run tauri dev`.

### Production builds

```bash
# engine release binary first, then staged for bundling:
(cd engine && cargo build --release)
cp engine/target/release/digiclip src-tauri/resources/         # linux/macos
cp engine/target/release/digiclip.exe src-tauri/resources/     # windows (+ the MSVC runtime DLLs it imports — CI does this)

npm run tauri build -- --no-bundle           # windows: raw app (exe + resources\)
npm run tauri build -- --bundles app         # macos:   DigiClip.app
npm run tauri build -- --bundles appimage    # linux:   DigiClip_<v>_amd64.AppImage
```

The shipped artifact is **DigiClip Setup with that build embedded** — see
[DigiClip Setup](#-digiclip-setup-all-platforms-offline) for how CI packs
it. `src-tauri/resources/` is gitignored — never commit the staged binary.

## ⚙️ Configuration

In-app **Settings** page controls the OpenRouter key/model, STT model, clip
count, caption default, tightening and punch-ins (persisted server-side in the
engine's `settings.json` — the key itself never leaves the backend).

| Key | Default | What it does |
|-----|---------|--------------|
| `OPENROUTER_API_KEY` | — | BYOK key for LLM clip scoring. Unset → offline heuristic scorer. |
| `OPENROUTER_MODEL` | `nvidia/nemotron-3-ultra-550b-a55b:free` | Scoring model (override in Settings). |
| `DIGICLIP_BIN` | — | Dev override: explicit engine binary path for the shell. |

Engine flags (`--model`, `--framing`, `--tighten`, …) are exposed per-job in
the UI and documented in the [engine README](https://github.com/n1ssyyy/DigiClip-CLI#usage).

## 📦 Media binaries & models

The engine self-provisions on first run (ffmpeg on Windows, YuNet face model,
whisper weights, caption fonts) into the OS user-data dir — see
[engine provisioning](https://github.com/n1ssyyy/DigiClip-CLI#rocket-getting-started).
The app bundles **only the engine binary** (`src-tauri/resources/` at build
time); weights and media tools download on first launch, so installers stay small
and later runs are fully offline.

## 🧪 Tests & code style

```bash
npm run build                                # frontend production build
cargo test --manifest-path engine/Cargo.toml  # engine: unit + integration
cargo check --manifest-path src-tauri/Cargo.toml  # shell
```

## 🤖 CI / CD

`.github/workflows/ci.yml` runs on pushes to `main`, PRs and tags:

| Job | Runner | Does |
|-----|--------|------|
| `frontend` | `ubuntu-24.04` | app + Setup `npm ci`, `npm run build` |
| `engine` | `ubuntu-24.04` | engine fmt check + `cargo test` from the submodule |
| `build` | `windows-latest`, `ubuntu-24.04`, `macos-latest` | engine (release) + [watchdog test](https://github.com/n1ssyyy/DigiClip-CLI/tree/main/.github/scripts) → stage into `src-tauri/resources/` (+ MSVC runtime on Windows) → app build → app payload → DigiClip Setup build + unit tests → **pack** (embed payload) → **install smoke test** (headless install, files/registry/desktop entry, launch the installed app and confirm it boots its engine, uninstall) → upload the Setup |
| `release` | `ubuntu-24.04` | on `v*` tags only: publishes exactly the three Setups — the job fails if anything else shows up |

Linux is pinned to `ubuntu-24.04` rather than `ubuntu-latest`: the glibc
floor of every Linux binary follows the runner, and ONNX Runtime's prebuilt
libraries already require glibc 2.38.

Cut a release (engine first, then app so the submodule pin is exact; the
tag must equal `version` in `src-tauri/tauri.conf.json` or CI refuses):

```bash
# in DigiClip-CLI: git tag v2.1.1 && git push origin v2.1.1
# in DigiClip:
git submodule update --remote engine   # pull the released engine commit
git add engine && git commit -m "chore: bump engine to v2.1.1"
git tag v2.3.2 && git push origin main v2.3.2
```

## 🔄 Updates

- **In-app updates** — on launch the shell asks the GitHub API for the
  latest release (silent when up to date or offline; toggle in Settings →
  Updates). A newer build raises a banner (bottom-left, release notes one
  click away). **Update** downloads the DigiClip Setup for this platform
  (with progress), launches it and exits; Setup closes anything still
  running and lays the new build in — same custom UI as a fresh install.
- **Trust model** — the GitHub release over HTTPS; the shell only
  downloads Setup assets from `github.com/n1ssyyy/DigiClip/releases`.
- **Joining from ≤ 2.3.0** — those builds' update check can't see this
  release format (and was blocked by the app's own CSP), so install 2.3.2+
  once from the releases page; every release after that arrives in-app.

## 🧙 DigiClip Setup (all platforms, offline)

DigiClip Setup is the installer on every OS: a Tauri wizard in the app's
own design language that does the install itself. No NSIS, no MSI, no
silent-switch hacks. **The app build is embedded in the Setup**, so a
release is just three files and installing needs no network. It detects
the machine and offers exactly what fits:

| Machine state | What Setup shows |
|---|---|
| Not installed | **Install now** (+ folder picker on Windows) |
| Installed, older build | **Update to vX** + Reinstall / Repair / Uninstall |
| Installed, same build | **You are up to date** + Reinstall / Repair / Uninstall |
| Installed, newer build | keep it, or **Install vX instead** (downgrade) / Uninstall |
| App running | close-and-continue guard (locked files are the #1 install failure) |
| Setup without a payload | uninstall + link to the full installer (the Windows uninstaller copy) |

Reinstall wipes the app folder first; Repair overwrites in place. User
data (clips, models, settings) lives in the OS user-data dir and is never
touched.

| OS | Installs to | Registration |
|---|---|---|
| Windows | `%LOCALAPPDATA%\DigiClip` (or `<picked folder>\DigiClip`) | Apps & features entry (uninstaller: a payload-free copy of Setup in the install dir) + Start Menu & desktop shortcuts |
| macOS | `/Applications/DigiClip.app` via `ditto` (standard admin prompt when needed) | — (the bundle is self-describing) |
| Linux | `~/.local/opt/digiclip/app` — the AppImage **unpacked**, so the app starts fast and never needs FUSE (no sudo) | `~/.local/share/applications/digiclip.desktop` + icon |

How the payload is embedded (`setup/scripts/pack.mjs` writes it,
`setup/src-tauri/src/payload.rs` reads it): `[payload][version][u32 len][u64 len]["DGCSETUP"]`
appended to

- Windows: the Setup exe itself (PE overlay),
- Linux: the Setup AppImage (squashfs ignores trailing bytes),
- macOS: `DigiClip Setup.app/Contents/Resources/payload.bin` (appending to
  the Mach-O would break its signature; the bundle is ad-hoc re-signed).

Headless flags (CI uses them; handy for scripted installs):

```text
--payload-info                     version this Setup installs (exit 2: none)
--detect                           what's installed on this machine
--install [--dir D] [--reinstall]  install without the wizard
--uninstall [--quiet]              remove DigiClip (Windows registers this)
```

```bash
cd setup
npm install
npm run tauri dev    # wizard dev loop (port 1430) — no payload in dev, so it opens in maintenance mode
```

## 🗺 Project map

```
src-tauri/src/main.rs     shell: engine boot, get_serve, update check/download/handoff, window/drag/reveal/open-url
src-tauri/tauri.conf.json product meta, window, CSP, bundled resources/
src-tauri/capabilities/   IPC permissions (core, dialog, fs)
src-tauri/resources/      staged engine binary at build time (gitignored)
src/main.jsx              boot gate (serve-ready -> sync -> UI)
src/lib/socket.js         whole backend over one WebSocket (no polling)
src/lib/native.js         Tauri bridge (window, dialogs, drag-drop, save flow)
src/lib/updates.js        updater store (check → download Setup → handoff)
src/components/digiclip/UpdateNotice.jsx  update banner + release-notes dialog
setup/                    DigiClip Setup — the offline installer (all platforms)
.github/scripts/          CI install smoke tests + MSVC runtime staging
src/pages/                Home (dropzone + pipeline + clips) · Health · Settings
src/components/digiclip/  Titlebar, dropzone, job cards, clip tiles, settings forms
engine/                   submodule -> DigiClip-CLI (the clipping pipeline)
```

## 🩺 Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Engine failed to start` boot screen | The shell couldn't boot the sidecar: check `DIGICLIP_BIN`, or build the engine (`cargo build --manifest-path engine/Cargo.toml`). In dev, the Retry button re-polls. |
| `engine did not answer in 60s` | Sidecar printed no banner — run the engine manually (`engine/target/debug/digiclip --serve`) and read its stderr. |
| `ffmpeg not found` in Health | Windows: let the engine auto-download, or `winget install Gyan.FFmpeg`. macOS/Linux: install via package manager (must include libass). |
| Transcribe/render jobs fail | Open the Health page — it reports exactly what's resolved (ffmpeg, libass, encoder, whisper sidecars, YuNet, GPU). |
| `tauri build`: resource path doesn't exist | `src-tauri/resources/` must exist (it ships a `.gitkeep`) and CI stages the engine binary there — don't delete the dir. |
| Submodule empty after clone | You cloned without `--recurse-submodules`: run `git submodule update --init --recursive`. |
| Plain `<a download>` never fires | Expected inside the webview — every export goes through the native save picker (`saveFile`). |

## 🗺 Roadmap

- [ ] Signed releases + auto-update channel.
- [ ] Chunked/resumable uploads for 2 GB+ sources.
- [ ] Two-person / letterbox framing presets.
- [ ] Engine version badge in Settings (surfaced from the submodule pin).

## 🤝 Contributing

PRs welcome: fork (with `--recurse-submodules`), branch, `npm run build` +
engine `cargo test` green, open a PR against `main`. CI must stay green on
Windows, Linux and macOS. Engine changes belong in the
[DigiClip CLI](https://github.com/n1ssyyy/DigiClip-CLI) repo — bump the
submodule here after they land.

## 📄 License

MIT — see `LICENSE`. Video you process stays yours and stays local.

## 🙏 Acknowledgements

Developed by [n1ssyyy](https://github.com/n1ssyyy) in collaboration with
[Shkolla Digjitale](https://shkolladigjitale.com/) (Prizren).

Built on Tauri · React · whisper.cpp · ffmpeg · ONNX Runtime · OpenRouter.
 Engine: [DigiClip CLI](https://github.com/n1ssyyy/DigiClip-CLI).
