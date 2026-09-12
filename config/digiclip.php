<?php

return [
    // Upload
    'accept' => '.mp4,.mov,.mkv,.webm,.m4a',
    'upload_max_mb' => (int) env('DIGICLIP_UPLOAD_MAX_MB', 500),
    'upload_max_kb' => (int) env('DIGICLIP_UPLOAD_MAX_MB', 500) * 1024,

    // OpenRouter (BYOK, model default)
    'openrouter' => [
        'base_url' => env('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
        'key' => env('OPENROUTER_API_KEY'),
        'model_default' => env('OPENROUTER_MODEL', 'meta/muse-spark-1.3'),
        // $/1M tokens, used for the "~$ cost" line. Unknown models → default.
        'pricing' => [
            'meta/muse-spark-1.3' => ['in' => 1.25, 'out' => 4.25],
            'openai/gpt-4o-mini' => ['in' => 0.15, 'out' => 0.60],
            'anthropic/claude-3.5-sonnet' => ['in' => 3.00, 'out' => 15.00],
            'google/gemini-2.0-flash' => ['in' => 0.10, 'out' => 0.40],
            'default' => ['in' => 1.50, 'out' => 5.00],
        ],
        'token_cap' => (int) env('OPENROUTER_TOKEN_CAP', 120000),
        'timeout_s' => (int) env('OPENROUTER_TIMEOUT_S', 90),
    ],

    // Transcription (whisper.cpp sidecar)
    'stt' => [
        'default_model' => env('DIGICLIP_STT_MODEL', 'base.en'),
        'models' => [
            'tiny.en' => ['file' => 'ggml-tiny.en.bin', 'size_mb' => 75],
            'base.en' => ['file' => 'ggml-base.en.bin', 'size_mb' => 142],
            'large-v3-turbo-q5_0' => ['file' => 'ggml-large-v3-turbo-q5_0.bin', 'size_mb' => 574],
            'large-v3-turbo' => ['file' => 'ggml-large-v3-turbo.bin', 'size_mb' => 1620],
            'large-v3' => ['file' => 'ggml-large-v3.bin', 'size_mb' => 2950],
        ],
    ],

    // Clips
    'clips' => [
        'count_default' => 3,
        'min_s' => 15,
        'max_s' => 90,
        'target_min_s' => 20,
        'target_max_s' => 45,
    ],
];
