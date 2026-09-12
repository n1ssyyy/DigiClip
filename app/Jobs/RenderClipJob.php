<?php

namespace App\Jobs;

use App\Models\ClipCandidate;
use App\Services\Render\RenderService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

class RenderClipJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 1800;

    public int $tries = 1;

    public function __construct(public int $clipId, public ?int $renderId = null) {}

    public function handle(RenderService $renderer): void
    {
        $clip = ClipCandidate::findOrFail($this->clipId);
        $existing = $this->renderId ? \App\Models\Render::find($this->renderId) : null;
        $render = $renderer->render($clip, function (int $pct) {
            if ($this->renderId) {
                \App\Models\Render::whereKey($this->renderId)->update(['progress' => $pct]);
            }
        }, $existing);
        if ($this->renderId && $render->id !== $this->renderId) {
            $this->renderId = $render->id;
        }
    }

    public function failed(Throwable $e): void
    {
        if ($this->renderId) {
            \App\Models\Render::whereKey($this->renderId)->update([
                'status' => 'failed',
                'error' => mb_substr($e->getMessage(), 0, 500),
            ]);
        }
    }
}
