/**
 * What the boot screen shows, given what the shell last said about the
 * engine start and how long this wait has been going. Pure: the page asks
 * the shell (`boot_status`) and feeds the answer in here.
 *
 *   shell      the last answer: { state: 'booting' | 'ready' | 'failed', message }
 *              or null when the shell has not answered yet
 *   waitedMs   how long this wait has been going (resets on a retry)
 *   silentMs   how long since the shell last answered at all
 *
 * The page never decides a start has failed on its own while the shell is
 * still trying: it only gives up when the shell says so, or when the shell
 * itself has stopped answering (so it never waits forever).
 */
export const SLOW_AFTER_MS = 6000;
export const SILENT_LIMIT_MS = 15000;

export function bootView({ shell, waitedMs = 0, silentMs = 0 }) {
    if (silentMs >= SILENT_LIMIT_MS) return { screen: 'failed', slow: false, reason: 'silent', message: null };
    const state = shell?.state;
    if (state === 'ready') return { screen: 'ready', slow: false, reason: null, message: null };
    if (state === 'failed') {
        const message = typeof shell.message === 'string' && shell.message.trim() ? shell.message : null;
        return { screen: 'failed', slow: false, reason: 'shell', message };
    }
    return { screen: 'boot', slow: waitedMs >= SLOW_AFTER_MS, reason: null, message: null };
}
