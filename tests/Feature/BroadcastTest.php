<?php

namespace Tests\Feature;

use App\Events\ProjectStatusChanged;
use App\Events\RenderProgressChanged;
use App\Models\Project;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class BroadcastTest extends TestCase
{
    use RefreshDatabase;

    public function test_status_change_broadcasts_on_project_channel(): void
    {
        Event::fake([ProjectStatusChanged::class]);
        $project = Project::create([
            'name' => 't', 'source_path' => 'x.mp4', 'mime' => 'video/mp4',
            'size_bytes' => 1, 'status' => 'queued',
        ]);

        $project->update(['status' => 'transcribing']);

        Event::assertDispatched(ProjectStatusChanged::class,
            fn ($e) => $e->projectId === $project->id
                && $e->broadcastOn() === ["project.{$project->id}"]
                && $e->broadcastAs() === 'project.status');
    }

    public function test_other_updates_stay_silent(): void
    {
        Event::fake([ProjectStatusChanged::class]);
        $project = Project::create([
            'name' => 't', 'source_path' => 'x.mp4', 'mime' => 'video/mp4',
            'size_bytes' => 1, 'status' => 'queued',
        ]);

        $project->update(['duration_s' => 12.5]);

        Event::assertNotDispatched(ProjectStatusChanged::class);
    }

    public function test_render_event_shape(): void
    {
        $e = new RenderProgressChanged(7, 3, 9, 45, 'rendering');

        $this->assertSame(['project.7'], $e->broadcastOn());
        $this->assertSame('render.progress', $e->broadcastAs());
        $this->assertSame(['clip_id' => 3, 'render_id' => 9, 'progress' => 45, 'status' => 'rendering'], $e->broadcastWith());
    }
}
