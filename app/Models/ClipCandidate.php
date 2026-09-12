<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ClipCandidate extends Model
{
    protected $fillable = [
        'project_id', 'rank', 'start_s', 'end_s', 'hook_line', 'why_it_works',
        'scores', 'score_total', 'title', 'hashtags', 'caption_style', 'source', 'status',
    ];

    protected function casts(): array
    {
        return [
            'start_s' => 'float',
            'end_s' => 'float',
            'scores' => 'array',
            'hashtags' => 'array',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function renders(): HasMany
    {
        return $this->hasMany(Render::class)->latest();
    }

    public function duration(): float
    {
        return round($this->end_s - $this->start_s, 2);
    }
}
