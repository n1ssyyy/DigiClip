<?php

namespace App\Events;

use App\Models\Project;
use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Fired on every project status transition (via Project model hook).
 * Public channel — single-user local app, no auth needed.
 */
class ProjectStatusChanged implements ShouldBroadcastNow
{
    use Dispatchable;

    public function __construct(public int $projectId) {}

    public function broadcastOn(): Channel
    {
        return new Channel("project.{$this->projectId}");
    }

    public function broadcastAs(): string
    {
        return 'project.status';
    }

    public function broadcastWith(): array
    {
        $project = Project::withCount('clipCandidates')->find($this->projectId);
        if (! $project) {
            return ['status' => 'gone'];
        }

        return [
            'status' => $project->status,
            'has_transcript' => $project->transcript()->exists(),
            'candidates_count' => $project->clip_candidates_count,
            'error' => $project->error,
        ];
    }
}
