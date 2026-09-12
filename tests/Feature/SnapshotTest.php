<?php

namespace Tests\Feature;

use App\Models\Project;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SnapshotTest extends TestCase
{
    use RefreshDatabase;

    public function test_snapshot_returns_pipeline_counts(): void
    {
        Project::create([
            'name' => 'a', 'source_path' => 'a.mp4', 'mime' => 'video/mp4',
            'size_bytes' => 1, 'status' => 'transcribing',
        ]);
        $ready = Project::create([
            'name' => 'b', 'source_path' => 'b.mp4', 'mime' => 'video/mp4',
            'size_bytes' => 1, 'status' => 'clips_ready',
        ]);
        $clip = $ready->clipCandidates()->create(['rank' => 1, 'start_s' => 0, 'end_s' => 5]);
        $clip->renders()->create(['preset' => 'tiktok', 'status' => 'done']);

        $this->get('/api/snapshot')
            ->assertOk()
            ->assertJsonPath('projects.transcribing', 1)
            ->assertJsonPath('projects.clips_ready', 1)
            ->assertJsonPath('renders.done', 1);
    }
}
