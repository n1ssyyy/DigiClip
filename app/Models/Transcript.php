<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Transcript extends Model
{
    protected $fillable = ['project_id', 'model', 'lang', 'full_text', 'words_json', 'segments_json', 'conf_avg', 'status'];

    protected function casts(): array
    {
        return ['conf_avg' => 'float'];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function words(): array
    {
        return json_decode($this->words_json ?? '[]', true) ?? [];
    }
}
