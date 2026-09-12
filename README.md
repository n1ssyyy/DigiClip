# DigiClip — dev setup

M0 scaffold: Laravel 13 + NativePHP Desktop v2 (`nativephp/desktop`) + Inertia
React + shadcn/ui (neutral, dark-first) + SQLite. See `PLAN.MD` for the full
production plan.

## 0. Toolchain (this machine, no sudo)

User-space toolchain lives in `~/.local` (Node 22, PHP 8.3 via Ubuntu
`apt download` + `dpkg-deb -x`, Composer 2.10). Every shell command in this
project needs these two exports (the composer-spawned `artisan` also needs
them — it uses the raw PHP binary, see `PHPRC`):

```bash
export PHPRC="$HOME/.local/php-root"
export LD_LIBRARY_PATH="$HOME/.local/php-root/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
```

Add them to `~/.bashrc` to make them permanent. `~/.local/bin` must be on
`PATH` (provides `php`, `composer`, `node`, `npm`).

Verify: `php -v` → 8.3.6, `composer --version` → 2.10.x, `node -v` → v22,
`php artisan native:debug Console -n` → full environment report.

`~/.local/php-root/php.ini` additionally sets `variables_order = "EGPCS"`
(so `$_ENV` is populated) and `extension=iconv`. `AppServiceProvider`
extends `ServeCommand::$passthroughVariables` with `PHPRC` +
`LD_LIBRARY_PATH` — otherwise `artisan serve` spawns its `php -S` child
with zero extensions and every request dies reading `.env`
(symfony mbstring polyfill → missing `iconv()`). If serve ever 500s on
every route, check the child env first (`/api/health` reports PHP exts).

## 1. First run

```bash
composer install
npm install
cp .env.example .env
php artisan key:generate
php artisan migrate
npm run dev          # vite dev server
php artisan serve    # Laravel (separate terminal)
php artisan reverb:start --host=127.0.0.1 --port=8080   # realtime sockets (separate terminal)
```

Open http://127.0.0.1:8000 → Inbox (dropzone). `/health` → system probe.
(Dev servers are disposable: `php artisan serve --port=800X`. If a server
starts 500ing after heavy file churn underneath it, restart it — PHP's
built-in server keeps loaded classes in memory.)

## 2. Tests + build + realtime

```bash
php artisan test     # green (feature + unit, incl. realtime handshake shape)
npm run build        # production assets → public/build
```

Live updates are event-based (Laravel Reverb on 127.0.0.1:8080 + Echo):
`project.{id}` carries `project.status` + `render.progress`. No polling,
no refresh buttons. In the packaged app the socket autostarts via
`NativeAppServiceProvider` (ChildProcess `reverb`, persistent); in dev run
`reverb:start` yourself. Verified end-to-end with a raw-websocket handshake
test (event fired in tinker → received on the socket).

## 3. NativePHP desktop

```bash
export PHPRC="$HOME/.local/php-root"   # every shell, like §0
export LD_LIBRARY_PATH="$HOME/.local/php-root/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
php artisan native:run -n    # dev loop (Electron + queue workers + hot reload)
php artisan native:build linux
```

Queue workers (`config/nativephp.php`): `default` (512MB/300s) +
`media` for `transcribe,render` (1024MB/1800s). `QUEUE_CONNECTION=database`.

Known upstream wrinkle (nativephp/desktop 2.3.0): the shipped
`electron-plugin/dist/` is stale (missing `pdfPageSize.js`), so the Electron
main build fails with "No electron app entry file found". Workaround (once
per `composer install/update`):
`npm run plugin:build` inside
`vendor/nativephp/desktop/resources/electron/`, then re-run. The
`/_native/api/* 403`s in logs are the expected `PreventRegularBrowserAccess`
gate (only the app webview may call them).

## 4. Env knobs (see `.env.example`)

`OPENROUTER_MODEL` (default `meta/muse-spark-1.3`), `DIGICLIP_STT_MODEL`
(default `base.en`), `DIGICLIP_UPLOAD_MAX_MB` (default 500).

## 5. Map (M0 files)

- `routes/web.php` — `/` Inbox, `/health`, `/api/health`, `POST /projects`
- `app/Http/Controllers/{ProjectController,HealthController}.php`
- `app/Services/System/HealthProbe.php` — ffmpeg/whisper/storage/db/queue probe
- `app/Services` seams for M1+: `Stt/`, `Clips/`, `Captions/`, `Render/`
- `config/digiclip.php` — upload/OpenRouter/STT/clip defaults
- `resources/js/{pages/{Inbox,Health},layouts/AppLayout,components/ui/*}` — shadcn neutral
- `tests/Feature/M0SmokeTest.php`
