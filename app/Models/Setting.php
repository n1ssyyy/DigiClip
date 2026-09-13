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
            // The encrypted cast decrypts on access: a value stored under a
            // rotated APP_KEY (fresh key per installer build, pre-pinning)
            // throws DecryptException here. Never take the app down over one
            // bad row — fall back to the default so pages render and jobs
            // run (heuristics) until the user re-saves the setting.
            return static::find($key)?->value ?? $default;
        } catch (\Throwable) {
            return $default; // table not migrated yet, or value undecryptable
        }
    }

    public static function set(string $key, ?string $value): void
    {
        static::updateOrCreate(['key' => $key], ['value' => $value]);
    }
}
