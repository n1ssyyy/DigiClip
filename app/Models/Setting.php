<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Single-row-ish key/value store. Secrets use the encrypted cast.
 */
class Setting extends Model
{
    protected $primaryKey = 'key';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['key', 'value'];

    protected function casts(): array
    {
        return ['value' => 'encrypted'];
    }

    public static function get(string $key, ?string $default = null): ?string
    {
        try {
            $row = static::find($key);
        } catch (\Throwable) {
            return $default; // table not migrated yet
        }

        return $row?->value ?? $default;
    }

    public static function set(string $key, ?string $value): void
    {
        static::updateOrCreate(['key' => $key], ['value' => $value]);
    }
}
