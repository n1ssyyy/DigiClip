# DigiClip — PLAN.MD
**AI harness: drop video → local transcribe → OpenRouter clip-pick → TikTok-ready captioned vertical clips**
**Stack: Laravel Native (NativePHP Desktop v2 `nativephp/desktop`) + Inertia + React + shadcn/ui (neutral) + ffmpeg + whisper.cpp sidecar**

> Status: M0 DONE + M1 DONE (2026-09-11). Local transcription works end-to-end:
> ffmpeg 7.0.2 static + whisper.cpp 1.9.4 (built from source) + `base.en` 142MB,
> upload → ExtractAudio → Transcribe chain on `transcribe` queue, transcript UI +
> SRT export, 16 tests green (incl. real JFK transcribe + full pipeline).
> Next: M2 clip-picking via OpenRouter (`meta/muse-spark-1.3`).
>
> UPDATE 2026-09-11 — M2 DONE: OpenRouter client (strict JSON, retries, usage),
> prompt builder, validator (snap/merge/dedupe/rank, unit-tested), heuristic
> fallback, `AnalyzeClipsJob` in the upload chain, candidates table + cards UI.
> Live proof: 66s video → 3 jobs on real queues in ~7s → scored candidates
> (e.g. "And so my fellow Americans…" 60). 23 tests green. Next: M3.
>
> UPDATE 2026-09-11 — M3 DONE (MVP demo): `AssBuilder` (4 presets, {\k}
> karaoke, 1080×1920, unit-tested incl. grouping/caps/stamps), bundled fonts
> (Anton, Archivo Black, Inter-Medium), `RenderService` (center-crop 9:16,
> libass burn + fontsdir, loudnorm, libx264/faststart, 5%-step progress),
> `RenderClipJob` on `render` queue, renders table + download route, render
> buttons + progress + MP4 links on candidate cards. Live proof: 16s
> 1080×1920 H.264+AAC clip rendered via worker in ~2s, downloaded intact.
> 33 tests green. Remaining: M4 harden (retry/logs, token/cost UI, updater,
> signing, 3-OS builds, face-track V2).
>
> UPDATE 2026-09-11 — NATIVE DEV LOOP WORKS: `native:run` boots Electron +
> backend + queue workers (window focus events seen, `/_native` bridge alive,
> app pages served). Two fixes required: (1) `electron-plugin/dist` stale in
> 2.3.0 → `npm run plugin:build` in vendor electron dir; (2) serve-env
> passthrough (see above). `native:serve` is deprecated → `native:run`.

## 16. Session state — compact checkpoint (2026-09-12)

Where things stand (45 tests green, vite build green):

- DONE: M0 scaffold, M1 transcribe, M2 clips (Muse Spark default), M3 render,
  M4-ish: settings UI (encrypted key, model, STT, counts, caption), usage/cost
  tracking, 4xx→heuristic fallback with honest reasons, retry + re-analyze,
  ASS caption budgets per preset (Pillow-verified ≤1000px), realtime via
  Reverb+Echo (no polling, no refresh buttons), model picker backend
  (`GET /api/openrouter-models`, cached 1h) + custom shadcn dropdown
  (search + Contributor/:free chips, persists via PUT /settings).
- Proven live: 445 models incl. `meta/muse-spark-1.3-contributor`, 19 `:free`,
  2 contributor. User video "videoplayback" (14.6min): transcript 3428 words,
  conf 0.911 — EXCELLENT. Clips heuristic-only because OpenRouter 402
  (no credits) after 403 (age gate, since confirmed). User to add credits →
  Re-analyze.
- Runtime layout: web dev DB = `database/database.sqlite`; NATIVE app DB =
  `database/nativephp.sqlite` (NativePHP redirects it; `native:migrate` does
  NOT touch it — it was auto-migrated at first native run). User project id 1
  lives in nativephp.sqlite. Native storage = `~/.config/laravel-dev/`.
- Toolchain: user-space `~/.local` (php/composer/node/cmake); every shell needs
  `PHPRC=$HOME/.local/php-root` + `LD_LIBRARY_PATH=$HOME/.local/php-root/usr/lib/x86_64-linux-gnu`.
  `~/.local/php-root/php.ini` adds iconv + `variables_order=EGPCS`.
- Landmines (all bitten once): (1) `artisan serve` strips env for `php -S`
  children → fixed via `ServeCommand::$passthroughVariables` in
  AppServiceProvider. (2) cli-server answers router fatals with `200 OK` —
  ALWAYS check bodies. (3) whisper.cpp must be built STATIC
  (`-DBUILD_SHARED_LIBS=OFF`); /tmp wipes on reboot orphan shared builds.
  (4) pusher-js needs no cluster (Echo passes `""`). (5) Echo remount race:
  sync `connection.state` before binding (see lib/echo.js onConnect).
  (6) Never `pkill -f` (matches own shell) — kill exact PIDs.
  (7) Model IDs contain dots → never Laravel dot-notation on them.
  (8) Laravel 13 Queueable already defines `$queue` → use `->onQueue()`.
  (9) Tests must `Storage::fake()` uploads (fake files leak 0-byte artifacts
  into real storage — several exist, harmless).
- Processes: native app relaunched post-reboot (renderer alive), manual
  `reverb:start` on :8080 (native autostart exists but bundled php lacks
  pcntl → SIGINT crash; dev socket is the manual one).
- UPDATE 2026-09-12 — custom window chrome: frameless shell
  (`NativeAppServiceProvider`: `frameless()` + `hideMenu()`), app header is
  the drag region with min/max/close on the right (`Titlebar.jsx` →
  `POST /native/window/*` → `WindowController`; no-op 204 outside native),
  double-click toggles maximize, maximize state syncs via Native events.
  Devtools no longer auto-open (`showDevTools(false)` beats the
  `app.debug`/dev-mode default). 46 tests green, vite build green.
- UPDATE 2026-09-12 — rounded shell + hover pills: transparent Electron
  window (`->transparent()`), `#app` is the rounded (12px) scroll card,
  radius drops when maximized; sidebar buttons grow to `max-w-52` pills on
  hover, overflowing the rail with the label fading/sliding in
  (`motion-safe`, delayed to match the expansion).
- UPDATE 2026-09-12 — rail v2: padded `w-16` sidebar, buttons are free
  `rounded-full` 48px circles (gap-2, never full-bleed); only the hovered
  button grows right over the content, rail + siblings stay put.
- UPDATE 2026-09-12 — rail v3 (per correction): rail back to `w-11`,
  buttons are 32px `rounded-md` squares (`size-8` icons) with 6px padding
  all around; hover grows just that button rightward out of the rail to
  reveal its label, anchored left so nothing jumps.
- UPDATE 2026-09-12 — chrome final: `--chrome` var + all `calc()`s ripped
  out, header/rail hard-coded to the same literal `53px` (buttons `40px`,
  all icons `20px` incl. maximize — it was `16px` before); pixel-measured
  53/53 in headless render; live window reloaded remotely via
  `Window::reload('main')`. 46 tests green.- UPDATE 2026-09-12 — full-bleed chrome: header spans edge-to-edge (h-11,
  thinner), all pages fill the window (`main` px-4/px-6, no max-w;
  Settings `max-w-2xl` dropped), icon-only sidebar (`Sidebar.jsx`,
  w-11 = header height, Inbox/Health top + Settings bottom, active state,
  sticky under header).
- Next: user adds OpenRouter credits → Re-analyze → AI clips → render.
  Their "other changes" pending. OpenRouterClient default model still
  `meta/muse-spark-1.3`; user uses `-contributor` via dropdown.
>
> UPDATE 2026-09-11 — NATIVE DEV LOOP WORKS: `native:run` boots Electron +
> backend + queue workers (window focus events seen, `/_native` bridge alive,
> app pages served). Two fixes required: (1) `electron-plugin/dist` stale in
> 2.3.0 → `npm run plugin:build` in vendor electron dir; (2) serve-env
> passthrough (see above). `native:serve` is deprecated → `native:run`.
>
> 2026-09-11 serve-fix (P0, resolved): every route fataled under
> `artisan serve` with masked `Class "config" does not exist`. Root cause:
> `serve` strips env to an allowlist when spawning `php -S`, so the child had
> no php.ini → no mbstring → Dotenv hit the mbstring polyfill → missing
> `iconv()`, pre-config, reporter couldn't log. Fixed via
> `ServeCommand::$passthroughVariables` (+PHPRC/LD_LIBRARY_PATH) in
> `AppServiceProvider`, `variables_order=EGPCS` + `extension=iconv` in our
> php.ini. Lesson: cli-server sends `200 OK` on router fatals — always check
> response BODIES, never just status codes.

---

## 0. TL;DR

1. User drag-drops a video (mp4/mov/mkv/webm, ≤2GB MVP).
2. App extracts 16kHz mono WAV locally, transcribes **on-device** with `whisper.cpp` + **`base.en` 142MB default (fast, ~16× realtime, ~5% WER)**. `tiny.en` 75MB instant-fallback, `large-v3-turbo-q5_0` ~574MB best-quality one-click upgrade. Word timestamps required.
3. Transcript + timings are chunked and sent to **default model `meta/muse-spark-1.3` (Muse Spark 1.3 Contributor) via OpenRouter** (JSON structured output, user-switchable) which returns ranked clip candidates: `start/end`, hook, virality score breakdown, title, hashtags, caption-style suggestion.
4. Local render pipeline: pad/merge → 9:16 center-crop (face-track in V2) → ASS animated subtitles (TikTok pop/karaoke) → ffmpeg burn → 1080×1920 H.264 + loudnorm exports.
5. Everything runs as Laravel queued Jobs (NativePHP `database` queue + SQLite), offline-first except the OpenRouter call. API key BYOK, stored encrypted.
6. Frontend is **Operate-mode** desktop UI: shadcn/ui `neutral` base, dark-first, `Inter` + `JetBrains Mono` for timecodes.

Why this shape: it copies what works in OSS (`SupoClip`, `clip-forge`, `auto-clipping`, `openshorts`, `karaoke-subs`/`auto-caption`/`tiktok-captions`) while fixing their weaknesses: heavy Python/torch deps, cloud lock-in, no jobs/retry, watermark/credit gates, bad caption timing.

---

## 1. Goals / Non-goals

### Goals (MVP must do)
- [ ] Drag-drop / file-picker ingest with progress + validation + thumbnail.
- [ ] 100% local transcription **optimized for speed (`base.en` 142MB default, <60s for 10-min video)** with one-click best-quality upgrade.
- [ ] Clip picking via OpenRouter with **default `meta/muse-spark-1.3`** + strict JSON + retry + cost cap (user-switchable).
- [ ] 1–5 ranked vertical clips (20–45s default, configurable 15–90s) with animated word-highlight subtitles burned in.
- [ ] Preview (side-by-side 16:9 → 9:16), edit in/out ±, re-render, export + SRT/ASS sidecars.
- [ ] Works packaged as NativePHP desktop app on Win/Mac/Linux, no terminal, no Python install.

### Non-goals (explicitly out of MVP)
- Mobile app, cloud render farm, auto-post to TikTok, background-music licensing, B-roll stock overlays, multi-speaker diarization, live/stream ingest. These are V2 (see §14).

---

## 2. Research — what we stole (and what we fixed)

| Project | What it does right | What we avoid / improve |
|---|---|---|
| **FujiwaraChoki/supoclip** (OSS Opus alternative) | Full pipeline: Whisper → LLM virality → MediaPipe face-crop → word-synced captions. Good virality dimensions (hook/engagement/value/shareability 0–100). | Requires Docker/self-host, server-side. We go fully local + NativePHP queue instead of Docker. |
| **JeremySNR/clip-forge** | AI moments + virality + animated captions + auto-zoom + speaker-aware reframe. | Monolith script, no job isolation. We split into discrete Laravel Jobs with retry. |
| **rawiansyahas/auto-clipping** | Simple file-or-URL → batch 9:16 + face-follow + burned captions. | No scoring transparency. We expose per-clip `why_it_works` + score breakdown. |
| **tkhudson/openshorts** (fully local, Ollama) | Offline-first, Quick vs AI-Smart modes, ASS+SRT export, ≥1080p, scene detection + VAD. | Ollama heavy, captions "not working well". We use whisper.cpp (no Python) + OpenRouter (no local LLM RAM) + proven ASS `\k` karaoke tags. |
| **DorXmoon/karaoke-subs**, **sebetancurch/auto-caption**, **Anish-I/tiktok-captions** | `words → group(max_words=4, max_chars=18–30, max_gap=0.6s) → ASS \k/\kf → ffmpeg -vf ass=` pattern. Presets: `tiktok/pop`, `karaoke`, `minimal`, `hormozi`, `mozi`, `beasty`. PlayRes 1080×1920, Alignment 5, BorderStyle 3 pill. | We port this to PHP (`App\Services\Captions\AssBuilder`) — zero Python dep at runtime. Keep their grouping constants. |
| **whisper.cpp / OpenWhispr docs / 2026 benchmarks** | `tiny 75MB / base 142MB / small 466MB / turbo 1.6GB (574MB q5_0) / large 3GB`. turbo≈5.1% WER vs large≈4.2% WER, 4–8× faster, 99 langs. Parakeet TDT 0.6B beats large-v3 on EN at ~680MB but 25 langs only. whisper.cpp = no Python, Metal on Mac. faster-whisper wins on NVIDIA but needs Python/CUDA. | Decision: **whisper.cpp + `large-v3-turbo` default (best). `large-v3` max-quality opt-in, `base.en` low-end fallback.** See §5. |
| **NativePHP docs (desktop v2, mobile v3/v4)** | `QUEUE_CONNECTION=database`, SQLite jobs table pre-migrated, `config/nativephp.php → queue_workers[]` with `queues/memory_limit/timeout/sleep`, `QueueWorker::up/down`, background worker auto-boots. | We use 2 workers (`transcribe` heavy/long-timeout, `render` + `default`). No Redis/Horizon in desktop. See §8. |
| **shadcn/ui Laravel + Theming docs** | Official path: `laravel new --react` (Inertia+React) → `dlx shadcn init` → `baseColor: neutral`, CSS vars, `.dark` toggle. `flexiwind` exists for Blade/Livewire but is non-canonical. | Decision: **Inertia + React + shadcn neutral**. Dark-first Operate UI. See §4. |

Key pipeline invariant learned from all clippers:

```
video → ffmpeg 16k wav → whisper words[] → group lines → LLM picks segments (by word idx, not just seconds)
      → snap to word boundaries + 0.25s pad → 9:16 crop → ASS → ffmpeg burn → mp4 + srt/ass
```

Never let the LLM return free-text times — always snap to word timestamps locally.

---

## 3. Architecture

```
┌────────────────────────────────────────────────────────────┐
│ DigiClip Desktop (NativePHP / Electron)                    │
│  React (Inertia) shadcn/neutral dark UI                    │
│   Dropzone → Project page → Transcript → Clips → Export    │
├────────────────────────────────────────────────────────────┤
│ Laravel 12 (SQLite)                                        │
│  Controllers (Inertia) │ Jobs (database queue) │ Services │
│   MediaIngest │ Transcribe │ ClipAnalyze │ Render │ Export │
│  Binaries: resources/bin/{win,mac,linux}/{ffmpeg,whisper}  │
│  Models: ~/Library/AppSupprt/DigiClip/models/*.bin        │
│  Workspace: projects/{id}/{source, audio.wav, clips/}      │
└──────────────┬──────────────────────────────┬──────────────┘
               │ local only                   │ network only
        whisper.cpp + ffmpeg            api.openrouter.ai
```

### DB (SQLite, single file)
- `projects(id, name, source_path, duration_s, width, height, fps, status, created_at)`
- `transcripts(id, project_id, model, lang, full_text, words_json, segments_json, wer_conf_avg)`
- `words` stored as JSON: `[{w, s: start_s, e: end_s, conf}]` — indexed by order, not separate table (perf).
- `clip_candidates(id, project_id, rank, start_s, end_s, score_total, score_json{hook,retention,value,share}, hook_line, why, title, hashtags_json, caption_style, status)`
- `renders(id, clip_candidate_id, ass_path, mp4_path, srt_path, preset, progress, log_tail, status, error)`
- `settings(id=1, openrouter_key_enc, openrouter_model, transcribe_model, caption_default, clip_min_s, clip_max_s, clips_count, export_preset)`
- Standard `jobs`, `failed_jobs`, `cache` tables.

### Job chain (each retryable independently)
1. `ExtractAudioJob` (queue `transcribe`, timeout 600, mem 512): `ffmpeg -i src -ar 16000 -ac 1 -c:a pcm_s16le audio.wav` + `ffprobe` meta.
2. `TranscribeJob` (queue `transcribe`, timeout 1800, mem 1024): spawn `whisper-cli -m ggml-base.en.bin -f audio.wav --output-json --word-timestamps --threads N`. Parse JSON → normalize words → save. Progress via polling stdout / file size heuristic + heartbeat `cache->put("transcribe:{id}", %)`.
3. `AnalyzeClipsJob` (queue `default`, timeout 300): build prompt chunks → OpenRouter → validate JSON schema → snap times → dedupe/merge → persist candidates. If no key/offline → heuristic fallback (energy + question-hooks + silence splits) so app never dead-ends.
4. `RenderClipJob` per candidate (queue `render`, timeout 1800, mem 1024, `WithoutOverlapping` per project): `AssBuilder` → `ffmpeg` crop/scale/pad + `ass=` + `loudnorm` + `libx264` → sidecars. Progress via `-progress pipe:1` parsed to %.
5. `ThumbnailJob` + `CleanupJob` (prune wav/chunks, keep source + finals).

`config/nativephp.php`:
```php
'queue_workers' => [
  'default'   => ['queues' => ['default'], 'memory_limit' => 512, 'timeout' => 300, 'sleep' => 2],
  'media'     => ['queues' => ['transcribe','render'], 'memory_limit' => 1024, 'timeout' => 1800, 'sleep' => 2],
],
```

---

## 4. Frontend — shadcn neutral + Operate mode

Skills applied: `/frontend-design` (thesis = the clip, not chrome), `/impeccable: Operate` (scanability > expression), `/ui-ux-pro-max` (a11y, touch, feedback).

> Brief wins over auto-suggest: ui-ux-pro-max suggested teal `#0D9488` + orange CTA. **Rejected** — user pinned `shadcn neutral`. We use neutral tokens below, dark-first (video tool = dark room).

### 4.1 Design tokens (Tailwind v4, CSS vars)
- `components.json`: `{ style: "new-york", baseColor: "neutral", cssVariables: true }`
- Fonts: `Inter` (UI, 400/500/600/700) + `JetBrains Mono` (timecodes, scores). Display face NOT needed — Operate mode, keep type quiet, let video be hero.
- Radius `0.625rem`, border `hsl(0 0% 14%)` dark, background `hsl(0 0% 7%)` (#121212-ish neutral-950), card `hsl(0 0% 10%)`, accent = white-on-neutral (no hue). Virality score uses neutral + single lime `#A3E635` dot only for ≥85 (one memorable accent, per frontend-design restraint rule).
- Signature element: **clip filmstrip timeline with word-level heat** (hook density bar). Everything else quiet.

### 4.2 Screens (Inertia pages in `resources/js/pages/`)
1. **`Inbox / New Project`** — hero is dropzone (not marketing). Large dashed zone, `Browse / drag video`, accept `mp4,mov,mkv,webm,m4a`, max 2GB note, STT chip (`base.en 142MB ✓ fast / tiny 75MB / turbo 574MB best`), OpenRouter model fixed default `meta/muse-spark-1.3` (switchable). Empty state: "Drop a 10+ min video. Get 3 vertical clips." + 3 sample thumbnails (static, no autoplay).
2. **`Project/Show`** — 3-column Operate layout (no scroll-jank):
   - Left: source preview + transcript (virtualized, click word → seek). Search + low-conf highlight (`conf<0.6` underline).
   - Center: candidate cards (`rank, score ring, hook_line, 05:04–05:54 badge, why_it_works, title/hashtags, caption style chip, Keep/Discard`). Bulk `Render all`.
   - Right: 9:16 preview player + caption-style picker + in/out trimmer + Export button.
   Components: `Dropzone, TranscriptView, ScoreRing, ClipCard, CaptionPresetPicker, RenderProgress, SettingsDialog, ModelPicker`.
3. **`Settings`** — OpenRouter key (password input, `Show`, `Test`), model input default `meta/muse-spark-1.3` (presets: `openai/gpt-4o-mini`, `anthropic/claude-3.5-sonnet`, `google/gemini-2.0-flash`, custom string), transcribe model select (`base.en` default fast + `tiny.en` + `large-v3-turbo-q5_0` best-upgrade + `large-v3` max) + download progress, caption default, clip length/count sliders, export preset (`TikTok 1080×1920`, `Reels`, `Shorts`), storage path + `Clear cache`.
4. **States**: uploading → extracting → transcribing (%) → analyzing → ready → rendering (%) → done/failed (per-job log tail + `Retry`). Toasts via `sonner`, dialogs via `Dialog`, progress via `Progress`, scores via custom ring (not emoji).

### 4.3 A11y / perf floor (ui-ux-pro-max P1–P5)
- Contrast 4.5:1, visible focus rings, keyboard: `Space` play, `J/L` ∓5s, `Enter` seek-to-word. 44px targets, no hover-only actions.
- Virtualize transcript >2k words, lazy thumbnails (`loading=lazy`, reserve 9:16 aspect to CLS<0.1), `prefers-reduced-motion` disables pop preview.
- No emojis as icons — Lucide only.

Wireframe (ASCII):
```
+----------------------------------------------------+
| DigiClip  [project name]        [model v] [settings]|
+----------+----------------------+------------------+
| SOURCE   | CLIPS (3)            | PREVIEW 9:16     |
| [16:9]   | [88] 05:04-05:54   |  [vertical]      |
| transcript| hook: "..."       |  style: [TikTok] |
| word word | why...  [Keep][X] |  [in––out]       |
| ...      | ...                |  [Export .mp4]   |
+----------+----------------------+------------------+
| jobs: transcribe 62% ██████▌  log tail...          |
+----------------------------------------------------+
```

---

## 5. Local STT harness (fast default, best available upgrade, no Python)

**Decision: `whisper.cpp` prebuilt binary. Default `base.en` for speed. No torch, no faster-whisper, no pip.**
**Owner directive: "fast — whatever you choose is okay" → speed wins, quality one click away.**

| Model | Disk | RAM | EN WER / speed | Verdict |
|---|---|---|---|---|
| **`base.en` (default)** | **142MB** | **~390MB** | **~5% WER, ~16× realtime** | **Default: <60s for 10-min video on laptop CPU** |
| `tiny.en` | 75MB | ~270MB | ~7.6% clean, ~32× realtime | Instant / old-laptop fallback |
| `large-v3-turbo-q5_0` | ~574MB | ~1GB | ~5.1% WER (99 langs), ~4× realtime GPU | **Best-quality one-click upgrade** (full ~1.6GB opt-in) |
| `large-v3` | ~3GB | ~3.9GB | ~4.2% WER | Max-quality opt-in only |
| `parakeet-tdt-0.6b-v3` (V2 candidate) | ~680MB ONNX | CPU-efficient, no hallucinations | Beats large-v3 on EN, 25 langs, needs sherpa-onnx | **V2 experiment** |

- Ship app with **no model**; on first transcribe, `ModelManager` downloads `ggml-base.en.bin` (142MB, seconds) with progress bar, SHA check, resume. `tiny.en`, `large-v3-turbo-q5_0`, `large-v3` URLs baked in as alternatives/upgrades.
- Binary matrix in `resources/bin/`: `win-x64/whisper-cli.exe`, `mac-arm64/whisper-cli`, `mac-x64/whisper-cli`, `linux-x64/whisper-cli` + matching `ffmpeg` static (BtbN / JohnVan / evermeet). Select at runtime via `PHP_OS_FAMILY` + `php_uname('m')`. `chmod +x` on unpack. Require `libass` in ffmpeg build (verify `ffmpeg -filters | grep ass` at boot, surface in Health page).
- Invoke: `whisper-cli -m base.en.bin -f audio.wav -oj -of out --word-timestamps --threads <nproc-1> -l en`. Parse `out.json` → `[{w,s,e,conf}]`. If word timestamps missing (old binary), fallback: distribute segment time evenly across words + mark `conf=null` (captions still work, pop-style instead of karaoke-sweep).
- Pre-process: `ffmpeg -i src -ar 16000 -ac 1 -c:a pcm_s16le audio.wav -y`. Chunk >30min into 10min windows with 30s overlap to bound RAM, re-offset timestamps.
- Languages: `en` default (`.en` models fast path). Multilingual `base`/`turbo` offered as toggle in Settings when non-EN detected.

PHP seam: `App\Services\Stt\WhisperCppTranscriber implements Transcriber { transcribe(wavPath): Words }` + `FakeTranscriber` for tests. All calls via `Symfony\Component\Process\Process` with timeout + streaming output → progress events via Laravel broadcasting (or polling `cache` for NativePHP simplicity).

---

## 6. Clip-picking harness (OpenRouter, default Muse Spark)

Provider: `https://openrouter.ai/api/v1/chat/completions`, `Authorization: Bearer $key`, `HTTP-Referer: digiclip.app`, `X-Title: DigiClip`.

- **Default model: `meta/muse-spark-1.3` (Muse Spark 1.3 Contributor tier)** — owner-pinned default. 1M context, multimodal reasoning, supports `response_format`, `tools`, `reasoning_effort`. ~$1.25/M in / $4.25/M out on OpenRouter. Free text override + presets (`openai/gpt-4o-mini`, `anthropic/claude-3.5-sonnet`, `google/gemini-2.0-flash`). Store per-project `model_used` (reproducibility). `config/digiclip.php → openrouter.model_default = 'meta/muse-spark-1.3'`.
- **Input**: transcript chunked to ~8k chars with 500-char overlap, each word block annotated `[mm:ss] text`. Include video duration, language, target count/lengths. Never send video bytes.
- **Prompt (system)**: "You are a short-form editor (Opus/Vizard style). Find self-contained moments with cold-open hook in first 2s, payoff before end, no mid-sentence cuts. Score hook/retention/value/share 0–100. Prefer questions, contrarian takes, numbers, stories. Return STRICT JSON only."
- **JSON schema (strict)**:
```json
{
  "clips": [{
    "start_s": 304.2, "end_s": 354.0,
    "hook_line": "Why your 10-week startup is failing",
    "why_it_works": "contrarian + number + payoff in 40s",
    "scores": {"hook": 92, "retention": 84, "value": 80, "share": 77},
    "title": "Chaos is not teachable",
    "hashtags": ["#startups", "#founder"],
    "caption_style": "tiktok"
  }]
}
```
- **Post-process (local, non-negotiable)**: validate with `opis/json-schema`, clamp 15–90s, **snap `start/end` to nearest word boundaries** (±0.25s pad, extend to sentence end if cut mid-word), merge overlaps >50%, dedupe by hook embedding/Jaccard >0.8, re-rank `0.4*hook+0.25*retention+0.2*value+0.15*share`, cap to requested count. Discard out-of-range.
- **Cost guard**: estimate tokens pre-flight, show `~$0.0X`, cap 120k tokens/project default (Muse 1M context — raise from 60k since default model is large-context), stream off, `temperature 0.3`, `response_format: {type:"json_object"}`, 2 retries with backoff, 90s timeout. Log usage (`prompt_tokens/completion_tokens/cost`) per project.
- **Offline fallback**: heuristic scorer (silence splits via `silencedetect`, question/exclamation boost, number-entity boost, energy via `astats`) so UI still yields clips with `score_source: heuristic`.

---

## 7. Caption + render engine

### 7.1 `AssBuilder` (PHP port of karaoke-subs grouping)
- Input: `words[]` sliced to clip + `preset`.
- Grouping: `max_words=4, max_chars=20, max_gap=0.6s, max_dur=4s`. One ASS Dialogue per line; per-word karaoke via `{\k<cs>}` where `cs = round((e-s)*100)`.
- Presets (all 1080×1920, `PlayResX:1080 PlayResY:1920`, `Alignment:5`, `BorderStyle:3` pill):
  - `tiktok/pop` (default): `Montserrat ExtraBold, 96, caps, white base, lime #A3E635 highlight, Outline 3, Shadow 0, pop scale via \t` — classic CapCut look.
  - `karaoke/sweep`: smooth `\kf` fill, yellow highlight.
  - `hormozi`: `Anton, 110, white + black box, center-low (MarginV 420)` — clear of TikTok UI.
  - `minimal`: `Inter Medium, 64, white 90%, subtle shadow`.
- Position: `low ≈ 68% down` default (avoids like/comment overlay), `mid/high` options.
- Fonts: bundle `Montserrat-ExtraBold.ttf`, `Anton-Regular.ttf`, `Inter-Medium.ttf` (OFL) in `resources/fonts`, install to user fonts dir on boot or reference via `fontsdir` in ASS.
- Output: `clip.ass` + `clip.srt` (line mode) + `clip.words.json` always (re-burnable, editor-friendly).

### 7.2 FFmpeg render (single pass, hardware-aware)
```bash
# 1) vertical crop+scale (center default; face-track V2 replaces crop expr)
# input 1920x1080 → 608x1080 crop → 1080x1920 scale
-vf "crop=ih*9/16:ih,scale=1080:1920:flags=lanczos,ass='clip.ass',format=yuv420p"
# 2) audio + loudness for mobile
-af "loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000"
-c:v libx264 -preset veryfast -crf 20 -c:a aac -b:a 192k -movflags +faststart
-ss <start> -t <dur>  # placed before -i for speed, refined with -ss after for accuracy (two-pass seek)
```
- Progress: `-progress pipe:1 -nostats` → parse `out_time_ms` → broadcast %.
- Accel: try `h264_nvenc` (Win/Linux+NVIDIA) → `h264_videotoolbox` (Mac) → fallback `libx264`. Probe at boot, store in `settings.render_encoder`.
- Thumbnails: `-ss middle -vframes 1 -q:v 3 thumb.jpg`.

---

## 8. NativePHP packaging specifics

- `composer require nativephp/electron` (desktop track). `php artisan native:install`, `native:build {win,mac,linux}` in CI.
- `config/nativephp.php`: `app_id: com.digiclip.app`, `deeplink: digiclip://`, min 1280×800, single-instance lock (second drop opens in same instance).
- Storage: `Native\Laravel\Facades\Storage` → user-data `digiclip/{projects,models,bin,exports}`. Never bundle videos; never write to `Program Files`.
- Secrets: OpenRouter key via `laravel-managed` encrypted cast (`encrypted:string`) + OS keychain plugin when available; `Test` button pings `/models`.
- Health screen on boot: ffmpeg found? libass? whisper binary exec? model present? disk space? encoder? Each with Fix action (re-download/re-chmod).
- Auto-update: GitHub releases + `native:update` channel `stable`.
- File assoc: double-click `.digiclip` project file opens app (V1.1).

---

## 9. File layout (Laravel 13 — M0 built 2026-09-11)

```
digiclip/
  app/
    Jobs/{ExtractAudioJob,TranscribeJob,AnalyzeClipsJob,RenderClipJob,ThumbnailJob}.php  # M1–M3
    Services/
      Media/{ProbeService,FfmpegService}.php                                              # M1
      Stt/{Transcriber,WhisperCppTranscriber,ModelManager,BinaryManager}.php              # M1
      Clips/{OpenRouterClient,ClipPrompt,ClipValidator,ClipRanker,HeuristicScorer}.php    # M2
      Captions/{AssBuilder,Presets,WordsGrouper}.php                                      # M3
      Render/{RenderService,EncoderProbe}.php                                             # M3
      System/HealthProbe.php                                                              # M0 DONE
    Models/{Project (DONE), Transcript, ClipCandidate, Render, Setting}.php
    Http/Controllers/{ProjectController (M0 upload), HealthController (M0), TranscriptController, ClipController, RenderController, SettingsController}.php
    Http/Middleware/HandleInertiaRequests.php                                             # M0 DONE
    Providers/NativeAppServiceProvider.php                                               # M0 DONE (1280×800 window, upload php.ini)
  resources/
    js/{pages/{Inbox (M0 dropzone+list), Health (M0 probe), Project/Show (M2+)},layouts/AppLayout,components/ui/*}
    bin/{win-x64,mac-arm64,mac-x64,linux-x64}/{ffmpeg*,whisper-cli*}                      # M1
    fonts/{Montserrat-ExtraBold,Anton-Regular,Inter-Medium}.ttf                           # M3 (Inter+JetBrains via Bunny CDN for now)
  config/{nativephp.php (M0: com.digiclip.app + default/media workers), digiclip.php (M0)}
  database/migrations/*_create_projects_table.php                                         # M0 DONE
  tests/{Feature/M0SmokeTest.php (5 green)}
  PLAN.MD (this file) + README.md (toolchain + dev setup)
```

`config/digiclip.php`: base.en/tiny/turbo-q5_0/large-v3 model URLs + SHA, ffmpeg args, grouping constants, OpenRouter default `meta/muse-spark-1.3`, limits (2GB, 90s max clip, 120k tokens).

---

## 10. UX copy (no lorem, plain verbs)

- Dropzone: "Drop a video" / "MP4, MOV, MKV up to 2GB. Stays on this machine."
- Transcribing: "Transcribing locally… 62%. Base fast, 142MB. You can close nothing — it resumes."
- No key: "Add an OpenRouter key to pick clips. Without it you'll get heuristic clips."
- Clip card: "Hook in first 2s ✓" / "Ends mid-sentence — extend 1.2s" (actionable, not vague).
- Errors: "Render failed at 41%: libass missing. [Re-check health] [View log] [Retry]" — never "Something went wrong."

---

## 11. Quality gates (definition of done per milestone)

- **Transcribe**: 30-min 1080p → words with ≥95% segments having timestamps, base.en <0.5× realtime on M1/i5 CPU (≈15min for 30min, <60s for 10-min video).
- **Analyze**: 100% valid JSON after snap (no out-of-range clips shipped), unit test with fixture transcript → deterministic snapshot (default model `meta/muse-spark-1.3` mocked).
- **Render**: 45s clip → 1080×1920, ≤60MB, captions legible on phone (test frame at 360px wide), audio -14 LUFS ±1.
- **App**: cold start <3s, drop→first transcript visible <90s for 10-min video (base.en), no renderer block (jobs async), crash in ffmpeg never kills UI (job failed + log).
- **A11y/perf**: Lighthouse-lite pass on desktop web preview, keyboard-only clip-to-export run recorded.

Tests: `AssBuilder` (karaoke tags, grouping edges), `ClipValidator` (snap/merge/dedupe), `WhisperParser` (fixture JSON), `PipelineTest` (fake STT + fake OpenRouter → 2 renders via test ffmpeg). CI builds 3 OS binaries + runs `native:test`.

---

## 12. Risks + mitigations

| Risk | Mitigation |
|---|---|
| whisper.cpp binary sprawl / signing (Mac Gatekeeper, Win Defender) | Prebuilt pinned version, codesign in CI, SHA verify, Health screen re-chmod; fallback to system ffmpeg if user has it |
| Word timestamps drift on music/noisy audio | Show conf, allow one-click `turbo-q5_0` best-quality upgrade; VAD pre-trim silence; manual nudge ±0.5s in trimmer |
| OpenRouter cost / model variance / JSON breakage | Strict schema + validator + snap; default `meta/muse-spark-1.3` with token cap + usage log; heuristic fallback |
| 9:16 crop cuts faces (no tracking MVP) | Center-crop + safe-position captions + preview; V2 face-track (MediaPipe/ONNX) replaces crop expr, no API change |
| SQLite + large blobs | Words as compressed JSON file + DB pointer if >5MB; VACUUM on cleanup |
| TikTok recompress kills quality | CRF 20 + faststart + loudnorm; export preset notes ("upload via desktop for less crush") |

---

## 13. Milestones

- **M0 scaffold (2–3d)**: Laravel + NativePHP + Inertia+React+shadcn neutral + SQLite + Health screen + binary probe. Dropzone stores file + ffprobe.
- **M1 local transcribe (3–4d)**: ModelManager + WhisperCppTranscriber + Extract/Transcribe jobs + transcript UI + SRT export.
- **M2 AI clips (3d)**: OpenRouter client + prompt/schema + validator/ranker + candidates UI + heuristic fallback.
- **M3 captions+render (4–5d)**: AssBuilder + 4 presets + Render jobs + 9:16 preview + export + thumbs. **MVP demo here.**
- **M4 harden (3d)**: retry/logs, token/cost UI, encoder accel, updater, signing, 3-OS builds, keyboard/a11y pass.
- **V2**: face-track crop, diarization, B-roll/music duck, TikTok/Reels direct upload, `.digiclip` files, batch queue.

---

## 14. Open decisions (need owner sign-off) — UPDATED per owner

1. ~~Default STT~~ → **DECIDED (speed): `base.en` 142MB default fast, `tiny.en` fallback, `turbo-q5_0` best-upgrade one click.**
2. ~~Default OpenRouter model~~ → **DECIDED: `meta/muse-spark-1.3` (Muse Spark 1.3 Contributor).** User-switchable, stored per-project.
3. Caption default: `tiktok/pop` lime — OK? (most viral, most polarizing.) **Rec: yes, with hormozi alt one click away.**
4. Max input 2GB / 2h — raise?
5. Telemetry: local-only logs vs opt-in crash reports? **Rec: opt-in, off default (privacy story).**

---

## 15. Build commands (for implementer)

> M0 actual (this machine has no sudo): user-space PHP 8.3/Node 22/Composer in
> `~/.local` (`PHPRC`+`LD_LIBRARY_PATH` exports required, see README.md), then
> `composer create-project laravel/laravel DigiClip`, manual Inertia+React wiring
> (no `laravel new --react` installer), `composer require inertiajs/inertia-laravel
> nativephp/desktop`, `npm i react react-dom @inertiajs/react @vitejs/plugin-react`,
> hand-rolled shadcn-style `ui/*` (neutral tokens, Tailwind v4). Original sketch kept below.

```bash
laravel new DigiClip --react && cd DigiClip
composer require nativephp/electron
php artisan native:install
pnpm dlx shadcn@latest init # baseColor: neutral, CSS vars: yes
pnpm dlx shadcn@latest add button card dialog input progress slider tabs toast sonner dropdown-menu tooltip separator badge scroll-area
php artisan make:model Project -m && php artisan make:model Transcript -m
php artisan make:job ExtractAudioJob && php artisan make:job TranscribeJob
php artisan make:job AnalyzeClipsJob && php artisan make:job RenderClipJob
# binaries → resources/bin/... + config/digiclip.php + config/nativephp.php workers
QUEUE_CONNECTION=database php artisan migrate
pnpm dev & php artisan native:serve
```

Health check: `php artisan digiclip:health` (ffmpeg `-filters|grep ass`, whisper `--version`, model SHA, encoder probe).

---

*Sources baked in: whisper.cpp ggml sizes/RAM (75/142/466MB), OpenWhispr local-model table, NativePHP queue_workers + database queue docs, shadcn Laravel+neutral theming docs, SupoClip/clip-forge/auto-clipping/openshorts pipelines, karaoke-subs/auto-caption/tiktok-captions ASS grouping (`4 words/18–30 chars/0.6s gap`, `\k` centiseconds, `ass=` burn, PlayRes 1080×1920).*
