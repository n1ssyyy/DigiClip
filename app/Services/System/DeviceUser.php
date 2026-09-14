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
        // get_current_user() returns the php.ini owner (usually "root"
        // for bundled runtimes), not the device login — only trust it
        // when it looks like a real login name.
        $owner = @get_current_user();
        if (is_string($owner) && $owner !== '' && $owner !== 'root') {
            return $owner;
        }
        foreach (['USER', 'USERNAME', 'LOGNAME'] as $key) {
            $v = getenv($key);
            if (is_string($v) && $v !== '' && $v !== 'root') {
                return $v;
            }
        }
        // Last resort: first entry of /etc/passwd with uid >= 1000.
        try {
            foreach (file('/etc/passwd', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
                $parts = explode(':', $line);
                if (count($parts) > 2 && (int) $parts[2] >= 1000 && (int) $parts[2] < 60000
                    && ! empty($parts[0]) && $parts[0] !== 'nobody') {
                    return $parts[0];
                }
            }
        } catch (\Throwable) {
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
