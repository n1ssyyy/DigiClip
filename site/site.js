/* DigiClip homepage. No dependencies, no build step.
   Everything that moves is decoration on top of content that is already
   in the HTML: with scripting off, or with reduced motion on, the page
   reads the same and every download link still works. */
(() => {
    'use strict';

    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
    const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    const ease = (p) => 1 - Math.pow(1 - p, 3);

    const REPO = 'n1ssyyy/DigiClip';
    const RELEASES = `https://github.com/${REPO}/releases`;
    const PLATFORMS = {
        win: { label: 'Windows', short: 'Win', file: 'DigiClip-Setup-Windows-x64.exe' },
        mac: { label: 'macOS', short: 'Mac', file: 'DigiClip-Setup-macOS-arm64.zip' },
        linux: { label: 'Linux', short: 'Linux', file: 'DigiClip-Setup-Linux-x86_64.AppImage' },
    };
    const latestUrl = (key) => `${RELEASES}/latest/download/${PLATFORMS[key].file}`;

    /* ---------------------------------------------------------------- */
    /* Helpers                                                           */
    /* ---------------------------------------------------------------- */

    /** Runs `tick(dt, t)` every frame, but only while `el` is on screen
     *  and the tab is visible, so off-screen demos cost nothing. */
    function runWhileVisible(el, tick) {
        let visible = false;
        let raf = 0;
        let last = 0;
        let t = 0;
        const frame = (now) => {
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            t += dt;
            tick(dt, t);
            raf = requestAnimationFrame(frame);
        };
        const sync = () => {
            const on = visible && !document.hidden;
            if (on && !raf) {
                last = performance.now();
                raf = requestAnimationFrame(frame);
            } else if (!on && raf) {
                cancelAnimationFrame(raf);
                raf = 0;
            }
        };
        new IntersectionObserver((entries) => {
            visible = entries[entries.length - 1].isIntersecting;
            sync();
        }, { threshold: 0.05 }).observe(el);
        document.addEventListener('visibilitychange', sync);
    }

    /** Calls `fn` the first time `el` scrolls into view. */
    function onceVisible(el, fn, threshold = 0.3) {
        const io = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) {
                io.disconnect();
                fn();
            }
        }, { threshold });
        io.observe(el);
    }

    function el(tag, props = {}, children = []) {
        const node = document.createElement(tag);
        for (const [k, v] of Object.entries(props)) {
            if (k === 'class') node.className = v;
            else if (k === 'text') node.textContent = v;
            else node.setAttribute(k, v);
        }
        for (const c of [].concat(children)) if (c) node.append(c);
        return node;
    }

    /* ---------------------------------------------------------------- */
    /* Icons                                                             */
    /* ---------------------------------------------------------------- */

    /** Draws an icon from the sprite as real nodes. A <use> reference
     *  cannot be styled from outside, and each icon's motion is one part
     *  moving against the others (site.css, "Icon choreography"). */
    function draw(svg, name) {
        const symbol = document.getElementById(`i-${name}`);
        if (!symbol) return svg;
        svg.setAttribute('viewBox', symbol.getAttribute('viewBox'));
        svg.dataset.icon = name;
        svg.replaceChildren(...[...symbol.children].map((part) => part.cloneNode(true)));
        return svg;
    }

    function icon(name) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'ico');
        svg.setAttribute('aria-hidden', 'true');
        return draw(svg, name);
    }

    /** Plays an icon's motion once, start to finish. A play that is
     *  already running is left alone, so hovering in and out never cuts
     *  one off halfway. */
    function play(svg) {
        if (REDUCED || svg.classList.contains('go')) return;
        svg.classList.add('go');
        setTimeout(() => svg.classList.remove('go'), 1000);
    }
    const playIn = (root, delay = 0) => {
        const icons = $$('.ico[data-icon]', root);
        if (delay) setTimeout(() => icons.forEach(play), delay);
        else icons.forEach(play);
    };

    function initIcons() {
        for (const svg of $$('svg.ico')) {
            const use = $('use', svg);
            if (use) draw(svg, use.getAttribute('href').slice(3));
        }
        if (REDUCED) return;
        /* An icon moves when the thing it belongs to is pointed at,
           focused or tapped. */
        const HOSTS = 'a, button, .step, .feat, .card-privacy';
        const enter = (e) => {
            const host = e.target.closest && e.target.closest(HOSTS);
            if (!host || (e.relatedTarget && host.contains(e.relatedTarget))) return;
            playIn(host);
        };
        document.addEventListener('pointerover', enter);
        document.addEventListener('focusin', enter);
        /* The clapper claps once as the page arrives. */
        playIn($('.brand'), 900);
    }

    /* ---------------------------------------------------------------- */
    /* Downloads: point the main button at this visitor's system         */
    /* ---------------------------------------------------------------- */

    function detectOS() {
        const ua = navigator.userAgent || '';
        const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
        const touchMac = /Mac/i.test(platform) && navigator.maxTouchPoints > 1; // iPad
        if (/android|iphone|ipad|ipod/i.test(ua) || touchMac) return null;
        if (/win/i.test(platform)) return 'win';
        if (/mac/i.test(platform)) return 'mac';
        if (/linux|x11/i.test(platform)) return 'linux';
        return null;
    }

    const os = detectOS();
    const state = { version: 'v2.9.0', sizes: {} };

    function paintDownloads() {
        for (const a of $$('[data-dl-main]')) {
            const label = $('[data-dl-label]', a);
            if (os) {
                a.href = latestUrl(os);
                label.textContent = `Download for ${PLATFORMS[os].label}`;
            } else {
                a.href = '#download';
                label.textContent = 'Get DigiClip';
            }
        }
        for (const node of $$('[data-version]')) node.textContent = state.version;
        const meta = $('[data-dl-meta]');
        if (meta && os) {
            const size = state.sizes[os] ? ` · ${state.sizes[os]}` : '';
            meta.textContent = `${state.version}${size} · free`;
        }
        for (const key of Object.keys(PLATFORMS)) {
            const size = $(`[data-size="${key}"]`);
            if (size && state.sizes[key]) size.textContent = state.sizes[key];
        }
        const mine = os && $(`[data-plat="${os}"]`);
        if (mine) {
            mine.classList.add('you');
            $('.plat-you', mine).hidden = false;
            $('.plat-go', mine).classList.replace('btn-secondary', 'btn-primary');
        }
    }

    /* ---------------------------------------------------------------- */
    /* Versions: live from GitHub, with a snapshot to fall back on       */
    /* ---------------------------------------------------------------- */

    const SNAPSHOT_DATE = '30 Sep 2026';
    const SNAPSHOT_TAGS = ['v2.8.0', 'v2.7.0', 'v2.6.0', 'v2.5.0', 'v2.4.0', 'v2.3.5', 'v2.3.4', 'v2.3.3', 'v2.3.2', 'v2.3.0', 'v2.2.2', 'v2.2.1', 'v2.0.1', 'v2.0.0'];
    const FIRST_ROWS = 7;

    const fmtSize = (bytes) => {
        const mb = bytes / 1048576;
        return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB`;
    };
    const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

    /** `**bold**` and `` `code` `` to nodes. Text only, never innerHTML. */
    function inline(text) {
        const frag = document.createDocumentFragment();
        for (const part of text.split(/(\*\*[^*]+\*\*|`[^`]+`)/)) {
            if (!part) continue;
            if (part.startsWith('**')) frag.append(el('b', { text: part.slice(2, -2) }));
            else if (part.startsWith('`')) frag.append(el('code', { text: part.slice(1, -1) }));
            else frag.append(part);
        }
        return frag;
    }
    const plain = (text) => text.replace(/\*\*|`/g, '');

    /** Pulls the human part out of a release body: the "What's new" list
     *  if there is one, else any other bullets or prose, else the merged
     *  pull request titles. */
    function notesOf(body) {
        const text = (body || '').replace(/^﻿/, '').replace(/\r/g, '');
        const section = (name) => {
            const m = text.match(new RegExp(`^##+ ${name}[^\\n]*\\n([\\s\\S]*?)(?=^##+ |^\\*\\*Full Changelog|(?![\\s\\S]))`, 'im'));
            return m ? m[1] : '';
        };
        const bullets = (chunk) => chunk.split('\n').map((l) => l.trim()).filter((l) => /^[-*] /.test(l)).map((l) => l.slice(2).trim());

        const fresh = bullets(section("What's new"));
        if (fresh.length) return fresh;

        const rest = text
            .replace(/^##+ (Install|What's Changed|New Contributors)[\s\S]*?(?=^##+ |^\*\*Full Changelog|(?![\s\S]))/gim, '')
            .replace(/^\*\*Full Changelog\*\*.*$/gm, '')
            .replace(/^##+ .*$/gm, '')
            .trim();
        const other = bullets(rest);
        if (other.length) return other;
        if (rest) return [rest.replace(/\s+/g, ' ').replace(/\s*See commits? [0-9a-f +]+\.?$/i, '')];

        return bullets(section("What's Changed")).map((l) => l.replace(/\s+by @\S+ in \S+$/, ''));
    }

    function normalize(release) {
        const assets = {};
        for (const a of release.assets || []) {
            for (const [key, p] of Object.entries(PLATFORMS)) {
                if (a.name === p.file) assets[key] = { url: a.browser_download_url, size: a.size };
            }
        }
        return {
            tag: release.tag_name,
            date: release.published_at,
            url: release.html_url,
            notes: notesOf(release.body),
            assets,
        };
    }

    async function loadReleases() {
        const KEY = 'digiclip-releases-v1';
        try {
            const cached = JSON.parse(sessionStorage.getItem(KEY) || 'null');
            if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.list;
        } catch { /* storage blocked: just fetch */ }
        const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=40`, {
            headers: { Accept: 'application/vnd.github+json' },
        });
        if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
        const list = (await res.json()).filter((r) => !r.draft && !r.prerelease).map(normalize);
        if (!list.length) throw new Error('no releases');
        try {
            sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), list }));
        } catch { /* fine */ }
        return list;
    }

    function releaseRow(rel, i) {
        const links = el('span', { class: 'rel-links' });
        for (const [key, p] of Object.entries(PLATFORMS)) {
            if (!rel.assets[key]) continue;
            links.append(el('a', { class: 'btn btn-ghost btn-sm', href: rel.assets[key].url, 'aria-label': `Download ${rel.tag} for ${p.label}` }, [icon('download'), p.short]));
        }
        links.append(el('a', { class: 'btn btn-ghost btn-sm', href: rel.url, 'aria-label': `${rel.tag} release notes on GitHub` }, ['Notes', icon('arrow-up-right')]));
        const summary = rel.notes.length ? plain(rel.notes[0]) : 'Release notes on GitHub';
        const row = el('li', { class: 'rel new', style: `--i:${i}` }, [
            el('div', {}, [el('b', { text: rel.tag }), el('span', { class: 'rel-sum', text: summary, title: summary }), links]),
        ]);
        return row;
    }

    function paintReleases(list, live) {
        const [latest, ...older] = list;
        state.version = latest.tag;
        for (const [key, a] of Object.entries(latest.assets)) state.sizes[key] = fmtSize(a.size);
        paintDownloads();

        $('#rel-tag').textContent = latest.tag;
        if (latest.date) $('#rel-date').textContent = fmtDate(latest.date);
        $('#rel-notes-link').href = latest.url;
        if (latest.notes.length) {
            const ul = $('#rel-notes');
            ul.replaceChildren(...latest.notes.slice(0, 6).map((n, i) => el('li', { style: `--i:${i}` }, inline(n))));
            ul.classList.add('fresh');
        }

        const listEl = $('#rel-list');
        const more = $('#rel-more');
        const rows = older.map((r, i) => releaseRow(r, i % FIRST_ROWS));
        rows.forEach((row, i) => { row.hidden = i >= FIRST_ROWS; });
        listEl.replaceChildren(...rows);

        const hiddenCount = rows.length - FIRST_ROWS;
        if (hiddenCount > 0) {
            more.hidden = false;
            $('#rel-more-label').textContent = `Show ${hiddenCount} older versions`;
            more.onclick = () => {
                rows.forEach((row) => { row.hidden = false; });
                more.hidden = true;
            };
        }
        if (!live) {
            const status = $('#rel-status');
            status.hidden = false;
            status.textContent = `GitHub didn't answer just now, so this is the list as of ${SNAPSHOT_DATE}. Reload to try again.`;
        }
    }

    function snapshotReleases() {
        const latest = {
            tag: 'v2.9.0',
            date: '2026-09-30T15:33:12Z',
            url: `${RELEASES}/tag/v2.9.0`,
            notes: [],
            assets: {
                win: { url: latestUrl('win'), size: 31846406 },
                mac: { url: latestUrl('mac'), size: 24870363 },
                linux: { url: latestUrl('linux'), size: 248574819 },
            },
        };
        const older = SNAPSHOT_TAGS.map((tag) => ({ tag, date: null, url: `${RELEASES}/tag/${tag}`, notes: [], assets: {} }));
        return [latest, ...older];
    }

    /* ---------------------------------------------------------------- */
    /* Page-level motion                                                 */
    /* ---------------------------------------------------------------- */

    function initReveals() {
        const targets = $$('[data-reveal]');
        if (REDUCED || !('IntersectionObserver' in window)) {
            targets.forEach((t) => t.classList.add('in'));
            return;
        }
        const io = new IntersectionObserver((entries) => {
            for (const e of entries) {
                if (!e.isIntersecting) continue;
                e.target.classList.add('in');
                io.unobserve(e.target);
                /* Icons act once as they arrive, after the rise has
                   mostly settled. The rail's icons wait for their step
                   to light instead (initScroll). */
                if (!e.target.classList.contains('step')) {
                    const order = +e.target.style.getPropertyValue('--i') || 0;
                    playIn(e.target, 320 + order * 45);
                }
            }
        }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
        targets.forEach((t) => io.observe(t));
    }

    function initPointerLight() {
        if (!matchMedia('(hover: hover)').matches) return;
        document.addEventListener('pointermove', (e) => {
            const panel = e.target.closest && e.target.closest('.panel');
            if (!panel) return;
            const r = panel.getBoundingClientRect();
            panel.style.setProperty('--mx', `${e.clientX - r.left}px`);
            panel.style.setProperty('--my', `${e.clientY - r.top}px`);
        }, { passive: true });
    }

    /** Scroll drives three things: the progress line under the chrome,
     *  the app window tilting flat as it arrives, and the pipeline rail. */
    function initScroll() {
        const bar = $('#progress');
        const stage = $('#stage');
        const rail = $('#rail');
        const steps = $$('.step', rail);
        const fill = $('#rail-fill');
        let lit = -1;
        let queued = false;

        const update = () => {
            queued = false;
            const vh = innerHeight;
            const max = document.documentElement.scrollHeight - vh;
            bar.style.setProperty('--p', clamp(scrollY / Math.max(1, max)).toFixed(4));

            if (!REDUCED) {
                const top = stage.getBoundingClientRect().top;
                const p = clamp((top - vh * 0.25) / (vh * 0.6));
                stage.style.setProperty('--tilt', `${(p * 9).toFixed(2)}deg`);
            }

            const r = rail.getBoundingClientRect();
            const p = REDUCED ? 1 : clamp((vh * 0.82 - r.top) / Math.max(vh * 0.5, r.height));
            const upto = Math.min(steps.length - 1, Math.floor(p * steps.length - 0.001));
            fill.style.setProperty('--p', p.toFixed(3));
            if (upto !== lit) {
                steps.forEach((s, i) => {
                    const on = i <= upto && p > 0;
                    const node = $('.node', s);
                    if (on && !node.classList.contains('lit')) playIn(node, 120);
                    node.classList.toggle('lit', on);
                });
                lit = upto;
            }
        };
        const request = () => {
            if (queued) return;
            queued = true;
            requestAnimationFrame(update);
        };
        addEventListener('scroll', request, { passive: true });
        addEventListener('resize', request);
        update();
    }

    /** The headline is spoken like a caption: each word lands in turn,
     *  then a highlight keeps sweeping through it, karaoke style. */
    function initHeadline() {
        const words = $$('#headline .w');
        const last = words.length - 1;
        if (REDUCED) {
            words.forEach((w) => w.classList.add('on'));
            words[last].classList.add('hot');
            return;
        }
        const hot = (i) => words.forEach((w, k) => w.classList.toggle('hot', k === i));
        words.forEach((w, i) => {
            setTimeout(() => {
                w.classList.add('on');
                hot(i);
            }, 260 + i * 210);
        });
        const sweep = () => {
            words.forEach((_, i) => setTimeout(() => hot(i), i * 330));
        };
        setInterval(() => { if (!document.hidden) sweep(); }, 6400);
    }

    /* ---------------------------------------------------------------- */
    /* The stage: the app turning one video into three clips             */
    /* ---------------------------------------------------------------- */

    function initStage() {
        const stage = $('#stage');
        const crop = $('#crop');
        const pa = $('#pa');
        const pb = $('#pb');
        const cap = $('#crop-cap');
        const stepLabel = $('#stage-step');
        const spinner = $('#stage-spin');
        const head = $('#tl-head');
        const barsEl = $('#tl-bars');
        const tilesEl = $('.tiles', stage);
        const tiles = $$('[data-tile]', stage);

        /* Timeline bars: fixed pseudo-random heights, louder where the
           three picked moments are. */
        const N = 56;
        const PICKS = [[6, 13], [24, 30], [41, 49]];
        let seed = 11;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const inPick = (i) => PICKS.findIndex(([a, b]) => i >= a && i <= b);
        const bars = [];
        for (let i = 0; i < N; i++) {
            const loud = inPick(i) >= 0;
            const bar = el('i', { style: `--h:${Math.round(loud ? 55 + rnd() * 45 : 16 + rnd() * 42)}` });
            if (loud) bar.classList.add('pick');
            bars.push(bar);
        }
        barsEl.append(...bars);
        spinner.classList.add('idle');
        if (REDUCED) return; // the HTML already shows the finished state

        const HALF = 31.64 / 2; // half the 9:16 crop, in % of the 16:9 frame
        const LINES = [
            [0.3, ["HERE'S", 'THE', 'THING']],
            [2.1, ['NOBODY', 'TELLS', 'YOU']],
            [4.2, ['YOU', "DON'T", 'NEED']],
            [6.0, ['A', 'MONTHLY', 'BILL']],
            [8.3, ['YOUR', 'CLIPS']],
            [9.9, ['STAY', 'ON', 'YOUR', 'DISK']],
        ];
        const STEPS = [[0, 'Transcribe'], [1.6, 'Pick + judge'], [3.3, 'Track the speaker'], [5, 'Render'], [8.2, '3 clips ready']];
        const DONE_AT = [5.2, 6.4, 7.6];
        const PERIOD = 12;

        let cropX = 27;
        let moving = false;
        let speaker = '';
        let line = -1;
        let wordsShown = 0;
        let stepIdx = -1;
        let lastT = PERIOD;
        const tileState = ['', '', ''];

        const setTile = (i, next) => {
            if (tileState[i] === next) return;
            tileState[i] = next;
            const tile = tiles[i];
            tile.classList.remove('empty', 'making', 'done', 'fresh');
            tile.classList.add(next);
            if (next === 'done') tile.classList.add('fresh');
        };

        runWhileVisible(stage, (dt, clock) => {
            const t = clock % PERIOD;
            const wrapped = t < lastT;
            lastT = t;

            /* Speakers: A sways, then B, who walks toward the middle. */
            const ax = 27 + Math.sin(clock * 1.3) * 1.1;
            let bx = 73 + Math.sin(clock * 1.1) * 1.1;
            if (t >= 8) bx = 73 - 17 * ease(clamp((t - 8) / 2.4));
            else if (t < 3) bx = 56 + 17 * ease(clamp(t / 3)) + Math.sin(clock * 1.1) * 1.1 * clamp(t / 3);
            pa.style.setProperty('--x', ax.toFixed(2));
            pb.style.setProperty('--x', bx.toFixed(2));

            /* Camera: cut between speakers, hold inside a dead band,
               follow smoothly once the subject really moves. */
            const who = t < 4 ? 'a' : 'b';
            const target = who === 'a' ? ax : bx;
            if (who !== speaker) {
                speaker = who;
                cropX = target;
                moving = false;
                pa.classList.toggle('talk', who === 'a');
                pb.classList.toggle('talk', who === 'b');
                crop.classList.remove('cut');
                void crop.offsetWidth;
                crop.classList.add('cut');
            } else {
                const d = target - cropX;
                if (!moving && Math.abs(d) > 2.4) moving = true;
                if (moving) {
                    cropX += d * (1 - Math.exp(-dt * 3.4));
                    if (Math.abs(d) < 0.25) moving = false;
                }
            }
            const x = clamp(cropX, HALF, 100 - HALF);
            crop.style.transform = `translateX(${(((x - HALF) / (HALF * 2)) * 100).toFixed(2)}%)`;

            /* Captions inside the crop, one word at a time. */
            let idx = -1;
            for (let i = 0; i < LINES.length; i++) if (t >= LINES[i][0]) idx = i;
            if (idx !== line) {
                line = idx;
                wordsShown = 0;
                cap.replaceChildren();
                if (idx >= 0) {
                    LINES[idx][1].forEach((w, i) => {
                        if (i) cap.append(' ');
                        cap.append(el('span', { class: 'cw', text: w }));
                    });
                }
            }
            if (line >= 0) {
                const spans = cap.children;
                const n = Math.min(spans.length, 1 + Math.floor((t - LINES[line][0]) / 0.34));
                if (n !== wordsShown) {
                    wordsShown = n;
                    for (let i = 0; i < spans.length; i++) {
                        spans[i].classList.toggle('on', i < n);
                        spans[i].classList.toggle('hot', i === n - 1);
                    }
                }
            }

            /* Timeline: the playhead sweeps, picked moments light up. */
            if (wrapped) {
                bars.forEach((b) => b.classList.remove('pick'));
                tilesEl.classList.remove('reset');
            }
            const p = clamp(t / 3.2);
            head.classList.toggle('live', t < 3.5);
            head.style.transform = `translateX(${(p * (barsEl.clientWidth - 2)).toFixed(1)}px)`;
            PICKS.forEach(([a, b]) => {
                if (p * N >= b && !bars[a].classList.contains('pick')) {
                    for (let i = a; i <= b; i++) bars[i].classList.add('pick');
                }
            });

            /* Status line */
            let s = 0;
            for (let i = 0; i < STEPS.length; i++) if (t >= STEPS[i][0]) s = i;
            if (s !== stepIdx) {
                stepIdx = s;
                stepLabel.textContent = STEPS[s][1];
                spinner.classList.toggle('idle', s === STEPS.length - 1);
            }

            /* Tiles: empty, making, done with the score counting up. */
            tiles.forEach((tile, i) => {
                if (t < 3.4 + i * 0.25) setTile(i, 'empty');
                else if (t < DONE_AT[i]) setTile(i, 'making');
                else {
                    setTile(i, 'done');
                    const score = +tile.dataset.score;
                    $('.tile-score', tile).textContent = Math.round(score * ease(clamp((t - DONE_AT[i]) / 0.6)));
                }
            });
            if (t > PERIOD - 0.4) tilesEl.classList.add('reset');
        });
    }

    /* ---------------------------------------------------------------- */
    /* Feature demos                                                     */
    /* ---------------------------------------------------------------- */

    function initCaptions() {
        const lineEl = $('#cap-line');
        const buttons = $$('#cap-styles button');
        const LINES = [['THIS', 'IS', 'THE', 'VIBE'], ['POST', 'IT', 'TONIGHT'], ['NO', 'WATERMARK']];
        let style = 'karaoke';
        let auto = !REDUCED;
        let line = -1;
        let shown = 0;
        let spans = [];

        const setStyle = (name) => {
            style = name;
            lineEl.className = `capdemo-line cs-${name}`;
            buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.style === name)));
        };
        const setLine = (i) => {
            line = i;
            shown = 0;
            lineEl.replaceChildren();
            spans = LINES[i].map((w, k) => {
                if (k) lineEl.append(' ');
                const s = el('span', { class: 'cw', text: w });
                lineEl.append(s);
                return s;
            });
        };
        const showAll = () => spans.forEach((s, i) => {
            s.classList.add('on');
            s.classList.toggle('hot', i === 1);
        });

        buttons.forEach((b) => b.addEventListener('click', () => {
            auto = false;
            setStyle(b.dataset.style);
            if (REDUCED) return;
            shown = 0;
            spans.forEach((s) => s.classList.remove('on', 'hot'));
            clock = 0;
        }));

        setLine(0);
        if (REDUCED) {
            showAll();
            return;
        }
        const WORD = 0.3;
        const HOLD = 1.1;
        let clock = 0;
        runWhileVisible($('#f-captions'), (dt) => {
            clock += dt;
            const n = Math.min(spans.length, 1 + Math.floor(clock / WORD));
            if (n !== shown) {
                shown = n;
                spans.forEach((s, i) => {
                    s.classList.toggle('on', i < n);
                    s.classList.toggle('hot', i === n - 1);
                });
            }
            if (clock > spans.length * WORD + HOLD) {
                clock = 0;
                const next = (line + 1) % LINES.length;
                if (auto) {
                    const order = buttons.map((b) => b.dataset.style);
                    setStyle(order[(order.indexOf(style) + 1) % order.length]);
                }
                setLine(next);
            }
        });
    }

    function initScores() {
        const card = $('#f-scores');
        const fills = $$('.bar b', card);
        const nums = $$('.bar em', card);
        if (REDUCED) {
            fills.forEach((b) => b.style.setProperty('--w', b.dataset.w));
            return;
        }
        fills.forEach((b) => b.style.setProperty('--w', 0));
        nums.forEach((n) => { n.textContent = '0'; });
        onceVisible(card, () => {
            fills.forEach((b, i) => setTimeout(() => b.style.setProperty('--w', b.dataset.w), 150 + i * 110));
            nums.forEach((n, i) => {
                const to = +n.dataset.count;
                const start = performance.now() + 150 + i * 110;
                const step = (now) => {
                    const p = clamp((now - start) / 900);
                    n.textContent = Math.round(to * ease(p));
                    if (p < 1) requestAnimationFrame(step);
                };
                requestAnimationFrame(step);
            });
        }, 0.45);
    }

    function initAspect() {
        const frame = $('#aspect-frame');
        const items = $$('#aspect-list li');
        const BOX = 132;
        const SHAPES = { '9:16': [9, 16], '4:5': [4, 5], '1:1': [1, 1], '16:9': [16, 9] };
        const show = (i) => {
            const [w, h] = SHAPES[items[i].dataset.r];
            const k = BOX / Math.max(w, h);
            frame.style.width = `${Math.round(w * k)}px`;
            frame.style.height = `${Math.round(h * k)}px`;
            items.forEach((li, n) => li.classList.toggle('on', n === i));
        };
        let i = 0;
        show(0);
        items.forEach((li, n) => li.addEventListener('pointerenter', () => { i = n; show(n); }));
        if (REDUCED) return;
        let clock = 0;
        runWhileVisible($('#f-aspect'), (dt) => {
            clock += dt;
            if (clock < 1.5) return;
            clock = 0;
            i = (i + 1) % items.length;
            show(i);
        });
    }

    function initWords() {
        const box = $('#words-text');
        const time = $('#words-time');
        const TEXT = 'the cloud clippers meter every minute of your footage so we built one that runs on your own machine';
        const spans = TEXT.split(' ').map((w) => el('span', { text: w }));
        spans.forEach((s, i) => {
            if (i) box.append(' ');
            box.append(s);
        });
        const BASE = 14.2;
        const WORD = 0.27;
        const stamp = (sec) => `00:${sec.toFixed(2).padStart(5, '0')}`;
        if (REDUCED) {
            spans.forEach((s) => s.classList.add('said'));
            return;
        }
        let clock = 0;
        let now = -1;
        runWhileVisible($('#f-words'), (dt) => {
            clock += dt;
            const total = spans.length * WORD + 1.2;
            if (clock > total) clock = 0;
            const i = Math.min(spans.length - 1, Math.floor(clock / WORD));
            time.textContent = stamp(BASE + Math.min(clock, spans.length * WORD));
            if (i === now) return;
            now = i;
            spans.forEach((s, k) => {
                s.classList.toggle('said', k < i);
                s.classList.toggle('now', k === i);
            });
        });
    }

    function initSpeed() {
        if (REDUCED) return;
        const num = $('#speed-num');
        const bars = $$('#speed-bars .bar').map((bar) => ({ fill: $('b', bar), pct: $('em', bar), shown: -1 }));
        const RATES = [1, 0.9, 0.82];
        const RUN = 2.4; // seconds of animation standing in for the 15 s run
        let clock = 0;
        runWhileVisible($('#f-speed'), (dt) => {
            clock += dt;
            if (clock > RUN + 2.2) clock = 0;
            const p = clamp(clock / RUN);
            num.textContent = (15 * p).toFixed(1);
            bars.forEach((bar, i) => {
                const pct = Math.round(clamp(p / RATES[i]) * 100);
                if (pct === bar.shown) return;
                bar.shown = pct;
                bar.fill.style.setProperty('--w', pct);
                bar.pct.textContent = `${pct}%`;
            });
        });
    }

    function initTerminal() {
        const out = $('#term-type');
        const rows = $$('#term-log li');
        const PROMPT = 'make 3 clips from talk.mp4 about pricing and retitle the best one';
        if (REDUCED) {
            out.textContent = PROMPT;
            return;
        }
        rows.forEach((r) => r.classList.add('off'));
        const CHAR = 0.045;
        const typed = PROMPT.length * CHAR;
        let clock = 0;
        let chars = -1;
        runWhileVisible($('#f-mcp'), (dt) => {
            clock += dt;
            if (clock > typed + 5.5) {
                clock = 0;
                rows.forEach((r) => r.classList.add('off'));
            }
            const n = Math.min(PROMPT.length, Math.floor(clock / CHAR));
            if (n !== chars) {
                chars = n;
                out.textContent = PROMPT.slice(0, n);
            }
            rows.forEach((r, i) => {
                if (clock <= typed + 0.5 + i * 0.75 || !r.classList.contains('off')) return;
                r.classList.remove('off');
                playIn(r, 80);
            });
        });
    }

    /* ---------------------------------------------------------------- */
    /* Likes                                                             */
    /* ---------------------------------------------------------------- */

    /** The like buttons stay hidden until /api/likes answers, so a host
     *  without the function just shows the page without them. A click
     *  paints at once and is put back if the server says no. */
    function initLikes() {
        const buttons = $$('[data-like]');
        const row = $('[data-like-row]');
        const msg = $('[data-like-msg]');
        if (!buttons.length) return;
        const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
        let state = null;
        let busy = false;

        const call = async (method) => {
            const res = await fetch('api/likes', { method, headers: { Accept: 'application/json' } });
            const data = await res.json();
            if (!res.ok || typeof data.count !== 'number') throw new Error(data.error || 'likes unavailable');
            return { count: data.count, liked: Boolean(data.liked) };
        };
        const paint = (tick) => {
            for (const b of buttons) {
                b.hidden = false;
                b.setAttribute('aria-pressed', String(state.liked));
                const n = state.count === 1 ? '1 like' : `${state.count} likes`;
                b.setAttribute('aria-label', state.liked ? `Liked. Take your like back (${n})` : `Like DigiClip (${n})`);
                const label = $('[data-like-label]', b);
                if (label) label.textContent = state.liked ? 'Liked' : 'Like DigiClip';
                const count = $('[data-like-count]', b);
                count.textContent = compact.format(state.count);
                if (tick) {
                    count.classList.remove('tick');
                    void count.offsetWidth;
                    count.classList.add('tick');
                }
            }
            if (row) row.hidden = false;
        };
        const toggle = async (button) => {
            if (busy || !state) return;
            busy = true;
            const before = state;
            state = { count: Math.max(0, before.count + (before.liked ? -1 : 1)), liked: !before.liked };
            paint(true);
            if (state.liked) {
                button.classList.remove('landed');
                void button.offsetWidth;
                button.classList.add('landed');
                $$('.ico', button).forEach((svg) => {
                    svg.classList.remove('go');
                    void svg.getBoundingClientRect();
                    play(svg);
                });
            }
            if (msg) msg.textContent = '';
            try {
                state = await call(before.liked ? 'DELETE' : 'POST');
                if (msg) msg.textContent = state.liked ? 'Liked. Thanks for backing it.' : 'Like removed.';
            } catch {
                state = before;
                if (msg) msg.textContent = "That didn't save. Check your connection and try again.";
            }
            busy = false;
            paint(false);
        };

        buttons.forEach((b) => b.addEventListener('click', () => toggle(b)));
        call('GET').then((data) => {
            state = data;
            paint(false);
        }).catch(() => { /* no likes API on this host: keep the buttons hidden */ });
    }

    /* ---------------------------------------------------------------- */
    /* Boot                                                              */
    /* ---------------------------------------------------------------- */

    function boot() {
        initIcons();
        paintDownloads();
        initReveals();
        initPointerLight();
        initHeadline();
        initStage();
        initScroll();
        initCaptions();
        initScores();
        initAspect();
        initWords();
        initSpeed();
        initTerminal();
        initLikes();

        loadReleases()
            .then((list) => paintReleases(list, true))
            .catch(() => paintReleases(snapshotReleases(), false));
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
