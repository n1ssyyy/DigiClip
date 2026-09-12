<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Project extends Model
{
    protected $fillable = ['name', 'source_path', 'mime', 'size_bytes', 'duration_s', 'width', 'height', 'status', 'error', 'usage_json'];

    protected function casts(): array
    {
        return ['usage_json' => 'array'];
    }

    protected static function booted(): void
    {
        // Event-based UI: every status transition pushes to project.{id}.
        static::updated(function (Project $project) {
            if ($project->wasChanged('status')) {
                try {
                    event(new \App\Events\ProjectStatusChanged($project->id));
                } catch (\Throwable) {
                    // Reverb down? UI degrades to the state from last load, never break the job.
                }
            }
        });
    }

    public function transcript(): HasOne
    {
        return $this->hasOne(Transcript::class);
    }

    public function clipCandidates(): HasMany
    {
        return $this->hasMany(ClipCandidate::class)->orderBy('rank');
    }
}
