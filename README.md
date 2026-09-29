<p align="center">
  <h1 align="center">DigiClip</h1>
</p>

<h2 align="center">Stop renting your clips.</h2>

<p align="center">
  <strong>The open-source AI clipper that does the OpusClip job on your own machine.<br />
  Free. Unlimited. No watermark. No upload.</strong>
</p>

<p align="center">
  Drop a podcast, stream or interview. DigiClip transcribes it offline, hunts down the moments worth posting,
  follows the speaker, burns in captions and hands you finished clips in 9:16, 4:5, 1:1 and 16:9.
</p>

<p align="center">
  <a href="https://github.com/n1ssyyy/DigiClip/releases/latest"><strong>⬇ Download for Windows · macOS · Linux</strong></a>
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
  <img src="https://shieldcn.dev/badge/whisper.cpp-STT-000000.svg?logo=huggingface&variant=default&size=default" alt="whisper.cpp" />
  <img src="https://shieldcn.dev/badge/ffmpeg-Render-00A8E8.svg?logo=ffmpeg&variant=default&size=default" alt="ffmpeg" />
</p>

<p align="center">
  <a href="https://github.com/n1ssyyy"><img src="https://shieldcn.dev/badge/Author-n1ssyyy-181717.svg?logo=github&variant=default&size=default" alt="n1ssyyy" /></a>
  <a href="https://github.com/n1ssyyy/DigiClip-CLI"><img src="https://shieldcn.dev/badge/Engine-DigiClip_CLI-1e40af.svg?logo=github&variant=default&size=default" alt="DigiClip CLI engine" /></a>
</p>

---

<h3 align="center">No credits. No watermark. No 3-day expiry. No monthly bill.</h3>

<p align="center">
  The cloud clippers meter every minute of <em>your</em> footage, stamp their logo on it and delete it after three days.<br />
  DigiClip runs on <em>your</em> hardware, as often as you like, and the clips are yours to keep.
</p>

## 🥊 How it stacks up

**Against the other open-source clippers.** Most of them are a Python repo, a Docker stack or a library. DigiClip is a real desktop app, and it picks clips without an API key.

| | **DigiClip** | AutoClip | OpenShorts | FunClip | AI-YouTube-Shorts-Generator |
|---|:-:|:-:|:-:|:-:|:-:|
| One-click desktop installer | ✅ Windows · Apple Silicon · Linux | ✅ Windows · Apple Silicon | ❌ Docker | ❌ Python setup | ❌ Python setup |
| Picks clips with zero API keys | ✅ offline scorer + local judge | ⚠️ needs an LLM (local Ollama works) | ⚠️ needs an LLM (local works) | ⚠️ you pick by hand | ❌ cloud LLM key required |
| Follows the speaker (face-tracked reframe) | ✅ | ❌ centre crop or blur | ✅ | ❌ | ✅ local mode |
| Animated, word-timed captions | ✅ 8 styles | ❌ static | ✅ | ❌ static | ❌ |
| Two-person split-screen | ✅ | — | ✅ | — | — |
| Paste a link | ✅ YouTube, TikTok, X, Vimeo… | ✅ YouTube, Bilibili | ✅ | — | ✅ YouTube |
| GPU encoding | ✅ NVENC · VideoToolbox | ? | ✅ NVENC | — | — |

<sub>Checked against each project's README and source on 2026-09-29: <a href="https://github.com/zhouxiaoka/autoclip">AutoClip</a> · <a href="https://github.com/mutonby/openshorts">OpenShorts</a> · <a href="https://github.com/modelscope/FunClip">FunClip</a> · <a href="https://github.com/SamurAIGPT/AI-Youtube-Shorts-Generator">AI-YouTube-Shorts-Generator</a>. — = not offered or not documented, ? = couldn't verify. Something out of date? Open an issue and we'll fix it.</sub>

**Against the paid SaaS.** Same idea, but you rent it, and your video goes to their servers.

| | **DigiClip** | OpusClip | Vizard | Klap |
|---|:-:|:-:|:-:|:-:|
| Price | **Free, MIT** | $15–29 / month | paid tiers | from $14 / month, billed yearly |
| Free plan | **Everything, unlimited** | watermarked captions, clips expire after 3 days | 60 min / month, 720p, watermark, 3-day storage | none listed |
| Your video goes | **nowhere** | to their cloud | to their cloud | to their cloud |

<sub>From the official pricing pages on 2026-09-29: <a href="https://www.opus.pro/pricing">OpusClip</a> · <a href="https://vizard.ai/pricing">Vizard</a> · <a href="https://klap.app/pricing">Klap</a>.</sub>

## ⚡ What it does

- 🎯 **Finds the moments that hit.** An LLM of your choice (any [OpenRouter](https://openrouter.ai) model) ranks every stretch for hook and payoff. No key? The offline scorer takes over. A System One judge then re-scores every candidate: TypeSafe's hosted **Jev**, or **Laya**, which runs on your own CPU. Type a topic and clips about it rank first.
- 🔍 **Shows its work.** Every clip is scored for hook, retention, value and share, with a **Why this clip** note, so you post the winners first.
- 🎙️ **Hears every word, offline.** whisper.cpp is compiled right into the engine. Word-level timing, no Python, no upload, no per-minute bill. English out of the box, other languages with a multilingual model.
- 🎥 **Frames like a camera operator.** Face tracking and a planned camera hold on a still speaker, follow a walking one and cut between speakers on the source's own shot cuts. No whip-pans. Two people on a podcast? **Split-screen** stacks them, with captions on the seam.
- ✂️ **Tightens the edit.** Dead air goes and filler words can too. Every cut lands on the quietest instant, frame-aligned, with click-free joins. Loud lines get a punch-in zoom.
- 💬 **Captions that pop.** Eight burned-in styles (karaoke, Hormozi, neon, beast and more) that pop in line by line or word by word. Need them in Spanish, German or Albanian? Translated subtitles stay synced to the speech.
- 🧩 **Every platform in one run.** Tick 9:16 *and* 4:5 *and* 16:9, and each clip renders in all of them.
- ✏️ **Edit instead of re-running.** Nudge a clip's start or end, retitle it, switch caption style or fix a misheard word, and only that clip re-renders. Or open the transcript, click the first and last word, and make your own clip.
- 📦 **Ready to post.** Each clip comes with `.srt` captions and an upload kit. Full-video mode adds YouTube chapters and a summary.
- 🔗 **Feeds itself.** Paste a link (YouTube, TikTok, X, Vimeo and more), or point it at a **watch folder** and every video dropped in starts on its own. DigiClip lives in the tray and can start when you sign in, so the folder is always watched.
- 🚀 **Fast.** Clips render side by side, GPU-encoded on NVENC or VideoToolbox. Three clips from a minute of video take about 15 seconds on a laptop RTX 3050. Audio lands on −14 LUFS, ready for every platform.
- 🌍 **Speaks your language.** The app itself comes in English, Albanian, German, French, Spanish, Italian and Turkish.
- 🔒 **Yours, start to finish.** Video, transcripts and renders never leave your disk. The only thing that ever goes out is transcript text, and only if you turn on an online picker, judge or translation.

## 📥 Get it

Grab the **DigiClip Setup** for your machine from the [latest release](https://github.com/n1ssyyy/DigiClip/releases/latest). It's one file with the whole app inside, and it needs no internet to install.

| System | Download |
|---|---|
| 🪟 Windows 10/11 (x64) | `DigiClip-Setup-Windows-x64.exe` |
| 🍎 macOS (Apple Silicon) | `DigiClip-Setup-macOS-arm64.zip` → unzip → open **DigiClip Setup** |
| 🐧 Linux x86_64 (Ubuntu 24.04+, Fedora 40+, Debian 13+) | `DigiClip-Setup-Linux-x86_64.AppImage` → `chmod +x` → run |

Run the same Setup again any time to update, repair or uninstall. Once it's installed, DigiClip updates itself.

> The installers aren't code-signed yet: on Windows hit **More info → Run anyway**, on macOS **System Settings → Privacy & Security → Open Anyway**.

## 🎨 Make it yours

Click the **sliders** icon on the upload card (Job options) before you drop a video. Everything is off until you switch it on, so an untouched panel gives you plain 9:16 clips.

| Option | What you get |
|---|---|
| **Preset** | Save the whole panel as *Podcast*, *Client A*, whatever, and load it in one click. |
| **Focus** | Type a topic (say *pricing*) and clips that talk about it rank first. |
| **Aspect** | Any mix of 9:16 (TikTok, Reels, Shorts), 4:5 (Instagram, LinkedIn), 1:1 and 16:9 (YouTube, X). |
| **Layout** | Auto, single camera or split-screen for two-person talks. |
| **Subtitles** | Keep the spoken language or translate the captions. |
| **Headline** | A title card pinned at the top. Leave the text empty and each clip gets its own title. |
| **Progress bar** | A thin bar filling along the bottom, in any colour you pick. |
| **Logo** | Your PNG or JPG in the corner you choose. Captions and the headline move out of its way. |
| **Music** | A background track, looped to length and ducked under speech. Soft, medium or loud. |

Drop **several videos at once** and each one queues as its own project. The engine works through them in turn.

## 🧬 Under the hood

```mermaid
flowchart LR
    V(["Video or link"]) --> A["Extract audio"] --> T["Transcribe"] --> P["Pick + judge"] --> F["Track the speaker"] --> R["Render"] --> C(["Clips"])
```

A Tauri shell boots the [DigiClip CLI](https://github.com/n1ssyyy/DigiClip-CLI) engine as a local daemon and streams every step to the UI live over a private localhost socket. Jobs survive restarts. The engine is a single Rust binary that also works on its own from the terminal.

**Built with** Tauri 2 · React 19 · Tailwind 4 · Rust · whisper.cpp · ONNX Runtime · ffmpeg · yt-dlp

## 🛠 Hack on it

You'll need Node 22, Rust stable, the engine's [build tools](https://github.com/n1ssyyy/DigiClip-CLI#-build-it) and ffmpeg with libass.

```bash
git clone --recurse-submodules https://github.com/n1ssyyy/DigiClip.git && cd DigiClip
(cd engine && cargo build --release)   # the engine
npm install && npm run tauri dev       # the app, which finds the engine on its own
```

`DIGICLIP_BIN=/path/to/digiclip` points the app at any engine build. The installer lives in `setup/`.

## ⚙️ Tune it

Everything lives in the app's **Settings**: OpenRouter key and model, clip judge, transcription model and language, clip count, caption style, tightening, punch-in zooms and the watch folder. Or set it from the environment:

| Variable | What it does |
|---|---|
| `OPENROUTER_API_KEY` | Unlocks LLM clip picking and subtitle translation (without it, the offline scorer runs). |
| `OPENROUTER_MODEL` | Scoring model. Default `nvidia/nemotron-3-ultra-550b-a55b:free`. |
| `JEV_API_KEY` | Uses TypeSafe's hosted Jev as the clip judge. |
| `DIGICLIP_BIN` | Dev: use a specific engine binary. |
| `DIGICLIP_DATA_DIR` | Dev: give the engine a separate settings and data folder. |

## 🚢 Ship it

Every push to `main` is built, installed and launch-tested on Windows, macOS and Linux. Tag it and CI publishes exactly three files, one Setup per platform with the app embedded.

```bash
git tag v2.7.0 && git push origin v2.7.0   # must match src-tauri/tauri.conf.json
```

## 🩺 Something off?

| Problem | Fix |
|---|---|
| A job fails | Open **Health**. It shows exactly what the engine found (ffmpeg, captions, encoder, models, GPU), and **Export diagnostics** saves a bug-report bundle with your keys stripped out. |
| A link won't download | DigiClip keeps its yt-dlp up to date on its own. Retry the job, and if it keeps failing, export diagnostics and open an issue. |
| `ffmpeg not found` | Windows fetches it for you. macOS: `brew install ffmpeg` · Linux: `sudo apt install ffmpeg`. |
| Linux Setup won't open | Your system has no FUSE. Run it with `--appimage-extract-and-run`. |
| Empty `engine/` folder | `git submodule update --init --recursive` |

## 📄 License

MIT, see `LICENSE`. Fork it, ship it, sell it. Your footage stays yours and stays local.

## 🙏 Acknowledgements

Developed by [n1ssyyy](https://github.com/n1ssyyy) in collaboration with
[Shkolla Digjitale](https://shkolladigjitale.com/) (Prizren).

Powered by Tauri · React · whisper.cpp · ffmpeg · ONNX Runtime · yt-dlp · OpenRouter · Jev & Laya (System One).
Engine: [DigiClip CLI](https://github.com/n1ssyyy/DigiClip-CLI).
