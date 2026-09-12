<?php

use App\Services\Stt\BinaryManager;
use App\Services\Stt\ModelManager;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('digiclip:provision-media {model? : STT model id (default: configured default)} {--all : Download every known STT model}', function (BinaryManager $binaries, ModelManager $models) {
    foreach (['ffmpeg', 'ffprobe', 'whisper-cli'] as $bin) {
        $path = $binaries->resolve($bin);
        $path
            ? $this->info("{$bin}: {$path}")
            : $this->error("{$bin}: MISSING — add it to resources/bin/<platform>/ or PATH (see resources/bin/README.md).");
    }

    $wanted = $this->option('all')
        ? array_keys(config('digiclip.stt.models', []))
        : [$this->argument('model') ?? config('digiclip.stt.default_model', 'base.en')];

    $fail = false;
    foreach ($wanted as $model) {
        if ($models->isDownloaded($model)) {
            $this->info("{$model}: already on disk.");
            continue;
        }
        $this->warn("{$model}: downloading…");
        $bar = $this->output->createProgressBar(100);
        $bar->start();
        try {
            $models->download($model, function ($pct) use ($bar) {
                static $last = 0;
                if ($pct > $last) {
                    $bar->advance($pct - $last);
                    $last = $pct;
                }
            });
            $bar->finish();
            $this->newLine();
            $this->info("{$model}: done.");
        } catch (\Throwable $e) {
            $bar->finish();
            $this->newLine();
            $this->error("{$model}: {$e->getMessage()}");
            $fail = true;
        }
    }

    return $fail ? self::FAILURE : self::SUCCESS;
})->purpose('Verify media binaries and pre-download whisper transcription models');
