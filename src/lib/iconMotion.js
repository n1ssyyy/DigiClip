// Icon life support (see motion.css): every icon gets its own idle cycle
// length and phase, so the occasional gestures scatter across the screen
// instead of firing in sync. A cheap MutationObserver stamps icons as
// they mount; nothing runs per frame.

const IDLE_KEY = 'digiclip.idleIcons';

let seed = 0x9e3779b9;
function rand() {
    // xorshift32: deterministic and fast; quality is irrelevant here.
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
}

function stamp(svg) {
    if (svg.dataset.idle) return;
    const len = 9 + rand() * 6;
    svg.dataset.idle = '1';
    svg.style.setProperty('--idle-t', `${len.toFixed(2)}s`);
    // Negative delay: start somewhere inside the cycle, and never all
    // gesture at once right after a page mounts.
    svg.style.setProperty('--idle-d', `${(-rand() * len).toFixed(2)}s`);
}

function scan(root) {
    if (root.nodeType !== 1) return;
    if (root.matches?.('svg.lucide, svg.brand-mark')) stamp(root);
    root.querySelectorAll?.('svg.lucide, svg.brand-mark').forEach(stamp);
}

/** Whether icons play their idle gestures (hover and press always do). */
export function idleIconsEnabled() {
    try {
        return localStorage.getItem(IDLE_KEY) !== 'off';
    } catch {
        return true;
    }
}

export function setIdleIcons(on) {
    try {
        localStorage.setItem(IDLE_KEY, on ? 'on' : 'off');
    } catch {
        // Private storage: the choice lasts for this session only.
    }
    document.documentElement.classList.toggle('no-idle', !on);
}

export function startIconMotion() {
    document.documentElement.classList.toggle('no-idle', !idleIconsEnabled());
    scan(document.body);
    new MutationObserver((records) => {
        for (const r of records) r.addedNodes.forEach(scan);
    }).observe(document.body, { childList: true, subtree: true });
}
