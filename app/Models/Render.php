<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Render extends Model
{
    protected $fillable = [
        'clip_candidate_id', 'preset', 'ass_path', 'srt_path', 'mp4_path',
        'encoder', 'progress', 'status', 'error',
    ];

    public function clipCandidate(): BelongsTo
    {
        return $this->belongsTo(ClipCandidate::class);
    }

    public function mp4Absolute(): ?string
    {
        return $this->mp4_path ? storage_path('app/'.$this->mp4_path) : null;
    }
}
