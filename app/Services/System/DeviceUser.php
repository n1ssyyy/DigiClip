<?php

namespace App\Services\System;

/**
 * Device owner's login name, for the onboarding greeting.
 * Prefers the OS login (posix), then the process owner, then env.
 * Never throws: null when nothing resolves (greeting falls back
 * to a nameless welcome).
 */
class DeviceUser
{
    public static function name(): ?string
    {
        try {
            if (function_exists('posix_geteuid') && function_exists('posix_getpwuid')) {
                $pw = @posix_getpwuid(posix_geteuid());
                if (is_array($pw) && ! empty($pw['name'])) {
                    return (string) $pw['name'];
                }
            }
        } catch (\Throwable) {
        }
        $owner = @get_current_user();
        if (is_string($owner) && $owner !== '') {
            return $owner;
        }
        foreach (['USER', 'USERNAME', 'LOGNAME'] as $key) {
            $v = getenv($key);
            if (is_string($v) && $v !== '') {
                return $v;
            }
        }

        return null;
    }

    /** Display form: first letter up, rest as-is ("nexaura" -> "Nexaura"). */
    public static function display(?string $name = null): ?string
    {
        if ($name === null || $name === '') {
            return null;
        }

        return mb_strtoupper(mb_substr($name, 0, 1)).mb_substr($name, 1);
    }
}
