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

<h3 align="center">Hours of footage in. Scroll-stopping clips out. Zero cloud.</h3>

<p align="center">
  Drop a podcast, stream or interview into DigiClip and watch it hunt down the moments worth posting,<br />
  frame the speaker, burn in captions and hand you vertical clips — all on your own machine.
</p>

## ⚡ Why DigiClip

- 🎯 **Finds the moments that hit.** An LLM of your choice scores every stretch for hook, payoff and replay value — and an offline scorer takes over when you don't want one.
- 🎙️ **Hears every word, offline.** whisper.cpp runs right inside the engine. Word-perfect timing, no Python, no upload, no per-minute bill.
- 🎥 **Frames like a camera operator.** Face tracking follows whoever is talking and glides between speakers instead of cutting blindly.
- 💬 **Captions that pop.** Eight burned-in styles — karaoke, Hormozi, neon, beast and more — plus `.srt` files and ready-to-paste upload kits.
- 🚀 **Fast.** Clips render side by side, GPU-encoded when you have one: three clips, a minute of video, done in about 15 seconds on a laptop RTX 3050.
- 🔒 **Yours, start to finish.** Video, transcripts and renders never leave your disk.

## 📥 Get it

Grab the **DigiClip Setup** for your machine from the [latest release](https://github.com/n1ssyyy/DigiClip/releases/latest). One file, the whole app inside, no internet needed to install.

| System | Download |
|---|---|
| 🪟 Windows 10/11 (x64) | `DigiClip-Setup-Windows-x64.exe` |
| 🍎 macOS (Apple Silicon) | `DigiClip-Setup-macOS-arm64.zip` → unzip → open **DigiClip Setup** |
| 🐧 Linux x86_64 (Ubuntu 24.04+, Fedora 40+, Debian 13+) | `DigiClip-Setup-Linux-x86_64.AppImage` → `chmod +x` → run |

Run the same Setup again any time to update, repair or uninstall — and once installed, DigiClip updates itself.

> The installers aren't code-signed yet: on Windows hit **More info → Run anyway**, on macOS **System Settings → Privacy & Security → Open Anyway**.

## 🧬 Under the hood

```mermaid
flowchart LR
    V(["Your video"]) --> A["Extract audio"] --> T["Transcribe"] --> P["Pick the moments"] --> F["Track the speaker"] --> R["Render 9:16"] --> C(["Clips"])
```

A Tauri shell boots the [DigiClip CLI](https://github.com/n1ssyyy/DigiClip-CLI) engine as a local daemon and streams every step to the UI live over a private localhost socket. Jobs survive restarts.

**Built with** Tauri 2 · React 19 · Tailwind 4 · Rust · whisper.cpp · ONNX Runtime · ffmpeg

## 🛠 Hack on it

You'll need Node 22, Rust stable, the engine's [build tools](https://github.com/n1ssyyy/DigiClip-CLI#-build-it) and ffmpeg with libass.

```bash
git clone --recurse-submodules https://github.com/n1ssyyy/DigiClip.git && cd DigiClip
(cd engine && cargo build --release)   # the engine
npm install && npm run tauri dev       # the app — finds the engine on its own
```

`DIGICLIP_BIN=/path/to/digiclip` points the app at any engine build. The installer lives in `setup/`.

## ⚙️ Tune it

Everything lives in the app's **Settings**: OpenRouter key and model, transcription model, clip count, caption style, tightening and punch-in zooms. Or from the environment:

| Variable | What it does |
|---|---|
| `OPENROUTER_API_KEY` | Unlocks LLM clip picking (without it, the offline scorer runs). |
| `OPENROUTER_MODEL` | Scoring model — default `nvidia/nemotron-3-ultra-550b-a55b:free`. |
| `DIGICLIP_BIN` | Dev: use a specific engine binary. |

## 🚢 Ship it

Every push is built, installed and launch-tested on Windows, macOS and Linux. Tag it and CI publishes exactly three files — one Setup per platform, app embedded.

```bash
git tag v2.3.4 && git push origin v2.3.4   # must match src-tauri/tauri.conf.json
```

## 🩺 Something off?

| Problem | Fix |
|---|---|
| A job fails | Open **Health** — it shows exactly what the engine found: ffmpeg, captions, encoder, models, GPU. |
| `ffmpeg not found` | Windows fetches it for you. macOS: `brew install ffmpeg` · Linux: `sudo apt install ffmpeg`. |
| Linux Setup won't open | No FUSE on your system — run it with `--appimage-extract-and-run`. |
| Empty `engine/` folder | `git submodule update --init --recursive` |

## 📄 License

MIT — see `LICENSE`. Your footage stays yours and stays local.

## 🙏 Acknowledgements

Developed by [n1ssyyy](https://github.com/n1ssyyy) in collaboration with
[Shkolla Digjitale](https://shkolladigjitale.com/) (Prizren).

Powered by Tauri · React · whisper.cpp · ffmpeg · ONNX Runtime · OpenRouter.
Engine: [DigiClip CLI](https://github.com/n1ssyyy/DigiClip-CLI).
