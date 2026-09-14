<?php

namespace App\Services\Stt;

/**
 * Thrown when a transcription run is cancelled cooperatively (project
 * paused or deleted mid-run). The owning job exits quietly: no failed
 * status, no error toast — the user's own action caused the stop.
 */
class TranscriptionCancelled extends \RuntimeException {}
