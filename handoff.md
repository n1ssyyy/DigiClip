# DigiClip - Known Issues & Context

## Open Issues

### 1. "Making" Spinner Position
- The spinning circle/loader next to "making" text on each clip should appear on the RIGHT side of the text
- Currently it's not positioned correctly in `resources/js/pages/Home.jsx`
- CSS/layout needs adjustment to float the spinner right of the label

### 2. UI Doesn't Auto-Update After Clips Finish
- After clips are analyzed and rendered, the UI stays stuck on "making"
- User must manually reload the page to see completed clips
- Likely missing: frontend polling, WebSocket/Reverb event broadcasting, or Inertia partial reload
- Backend events ARE being broadcast (`RenderClipJob` broadcasts `ClipRendered` event), but the frontend may not be listening/reacting
- The `videos` page needs either:
  - Polling (e.g. `setInterval` fetch video status)
  - Or proper Reverb/WebSocket listener for `ClipRendered` events
  - Or Inertia `router.reload()` on a timer

### 3. Video Playback Broken
- Videos that were previously playable now show a loading icon forever
- The video player route is `GET /videos/{video}/file` which streams the MP4 via `StreamController`
- Possible causes:
  - Route may have been broken during a recent change
  - Range request handling in `StreamController::stream()` may be failing
  - The stored video file path may not be resolving correctly
  - Check `app/Http/Controllers/StreamController.php` and the route in `routes/web.php`

## What's Working
- Video upload + transcription (whisper.cpp sidecar) works
- Clip analysis via OpenRouter with tool calling works (after timeout fix to 300s)
- Clip rendering (FFmpeg) works - all 3 clips rendered successfully in DB
- OpenRouterClient now uses tool/function calling with `submit_clips` tool + markdown fallback
- Build system works: `php artisan native:build` with patched PrunesVendorDirectory (--no-scripts + dump-autoload + package:discover)

## Recent Changes (all on `main` branch, v1.0.13)

### Files Modified
- `app/Services/Clips/OpenRouterClient.php` - Switched from `response_format: json_object` to tool/function calling with `submit_clips` tool, added content fallback and markdown extraction fallback, timeout bumped to 300s
- `app/Services/Clips/ClipPrompt.php` - System prompt now says "Use the submit_clips tool to return your results"
- `app/Services/Render/RenderService.php` - Progress DB updates wrapped in try-catch
- `app/Jobs/RenderClipJob.php` - Frontend broadcasts wrapped in try-catch
- `tests/Feature/OpenRouterClientTest.php` - Updated for tool_calls format, added fallback tests (7/7 passing)
- `config/digiclip.php` - OpenRouter timeout increased to 300s
- `config/nativephp.php` - Build config (version 1.0.13)

### Build System Fix
- `vendor/nativephp/desktop/src/Builder/Concerns/PrunesVendorDirectory.php` - **NOT committed** (vendor file, gets overwritten on `composer update`)
- Must re-patch before every build: change `composer install --no-dev` to `--no-dev --no-scripts`, add `composer dump-autoload --optimize --no-scripts` step, add `php artisan package:discover --ansi` step, add cache clearing step
- This fixes the stale `bootstrap/cache/services.php` referencing dev-only packages (Pail)

## Key Architecture Notes

### File Paths
- Source: `/mnt/NEXAURA/DEVELOPER/DigiClip`
- Installed app: `/opt/DigiClip/resources/build/app/`
- Database: `~/.config/digiclip/database/database.sqlite` (WAL mode, busy_timeout=5000)
- Logs: `~/.config/digiclip/storage/logs/`
- Queue: database driver, retry_after=15000

### Queue Workers
- `default` queue: timeouts, general jobs
- `media` queue: `transcribe`, `render` - 1024MB memory, 14400s timeout
- Queue workers run from source dir `/mnt/NEXAURA/DEVELOPER/DigiClip`, NOT from installed dir

### APP_KEY
- Pinned via `AppServiceProvider::pinNativeAppKey()` - reads from `~/.config/digiclip/app-key`

### Rendering Pipeline
1. User drops video -> `StoreVideoJob` -> extract audio -> `TranscribeJob` (whisper.cpp sidecar via Vulkan on RTX 3050)
2. `AnalyzeClipsJob` -> OpenRouter API (tool calling) -> stores Clip records
3. `RenderClipJob` (on `render` queue) -> FFmpeg 6.1.1 -> stores rendered MP4
4. Video playback via `StreamController::stream()` with Range request support

### Key Route
- `Route::get('/videos/{video}/file', StreamController::class)->name('videos.file');`

## Testing Checklist
- [x] Fix spinner position (right side of "making" text) — was already fixed in source (`making` then `Loader2` in `ClipTile`); verified in bundle. Needs rebuild to reach installed app.
- [x] Fix auto-refresh after clips finish — kept polling fix (poll while any render in flight); Reverb path confirmed dead in native runtime (bundled PHP has no pcntl, nothing listens on 8080), so `log` override restored.
- [x] Fix video playback (loading icon issue) — root cause was `Response::setCallback` 500 on every Range request; replaced with `response()->file()`. Regression test added (`test_stream_answers_range_requests_with_exact_byte_window`).
- [x] Fix `broadcastOn` fatal (`in_array` on Channel object in NativePHP EventWatcher) — events now return string channel arrays.
- [ ] Rebuild + reinstall (`php artisan native:build`) — REQUIRED: running app/serve/queue workers all execute from `/opt/DigiClip/resources/build/app`, not source, so none of the above takes effect until rebuild.
- [ ] Verify OpenRouter tool calling works end-to-end
- [ ] Verify rendering pipeline completes without manual reload (after reinstall: upload → wait ≤10s per refresh tick, no manual reload)

## Verification Notes (2026-09-14, second pass)
- Production log `~/.config/digiclip/storage/logs/laravel-2026-09-14.log` showed 8× `Response::setCallback does not exist` (every `<video>` Range request 500'd) plus `in_array(... Channel given)` fatals from NativePHP's `EventWatcher` on every broadcast.
- `response()->file()` (BinaryFileResponse) verified: 200 full, 206 + exact 100-byte body for `bytes=0-99`, 404 when file missing.
- Full suite: 110 tests pass (1 skipped: missing fixture-dependent case; 9 PHPUnit notices pre-existing). Run with `~/.local/bin/php vendor/bin/phpunit` (the wrapper sets LD_LIBRARY_PATH/PHPRC; bare `php artisan test` reports missing extensions because `artisan` resolves the wrong php).
- `handoff.md` architecture note correction: queue workers + `serve` run from `/opt/DigiClip/resources/build/app` (confirmed via /proc cwd), NOT from source dir.
