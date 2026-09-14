<?php

namespace App\Events;

use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * NOTE: broadcastOn returns a plain string channel name, not a Channel
 * object — see ProjectStatusChanged for why.
 */
class RenderProgressChanged implements ShouldBroadcastNow
{
    use Dispatchable;

    public function __construct(
        public int $projectId,
        public int $clipId,
        public int $renderId,
        public int $progress,
        public string $status,
    ) {}

    public function broadcastOn(): array
    {
        return ["project.{$this->projectId}"];
    }

    public function broadcastAs(): string
    {
        return 'render.progress';
    }

    public function broadcastWith(): array
    {
        return [
            'clip_id' => $this->clipId,
            'render_id' => $this->renderId,
            'progress' => $this->progress,
            'status' => $this->status,
        ];
    }
}
