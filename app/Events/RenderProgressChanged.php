<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

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

    public function broadcastOn(): Channel
    {
        return new Channel("project.{$this->projectId}");
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
