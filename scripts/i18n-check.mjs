// Translation check for the app's UI strings.
//
//   node scripts/i18n-check.mjs <file|dir> [<file|dir> ...] [--props] [--all]
//
// Scans .js/.jsx files for string literals passed to `t(` and reports any
// that is missing from any of the six merged dictionaries (sq, de, fr, es,
// it, tr). It only looks at the files and folders you pass; `--all` scans
// all of src/. `--props` also lists string values of `label`, `tip`,
// `hint`, `title` and `name` properties, which the UI passes to `t()` as a
// variable (informational: it cannot tell a sentence from an id).
// Also verifies every area file in src/i18n has all six languages and is
// registered in src/i18n/index.js. Exit code 1 when anything is missing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const I18N = path.join(root, 'src', 'i18n');
const LANGS = ['sq', 'de', 'fr', 'es', 'it', 'tr'];

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const targets = args.filter((a) => !a.startsWith('--'));
if (!targets.length && !flags.has('--all')) {
    console.error('usage: node scripts/i18n-check.mjs <file|dir>... [--props] [--all]');
    process.exit(2);
}

// --- dictionaries -----------------------------------------------------------

let problems = 0;
const indexText = fs.readFileSync(path.join(I18N, 'index.js'), 'utf8');
const merged = Object.fromEntries(LANGS.map((l) => [l, {}]));
for (const f of fs.readdirSync(I18N).filter((n) => n.endsWith('.js') && n !== 'index.js').sort()) {
    const name = f.replace(/\.js$/, '');
    const text = fs.readFileSync(path.join(I18N, f), 'utf8');
    if (!new RegExp(`from '\\./${name}'`).test(indexText)) {
        console.log(`area ${f} is not imported by src/i18n/index.js`);
        problems++;
    }
    let dict;
    try {
        dict = new Function(text.replace(/^\s*export default/m, 'return'))();
    } catch (e) {
        console.log(`area ${f} does not parse: ${e.message}`);
        problems++;
        continue;
    }
    for (const l of LANGS) {
        if (!dict[l]) {
            console.log(`area ${f} has no ${l} dictionary`);
            problems++;
            continue;
        }
        Object.assign(merged[l], dict[l]);
    }
}

// --- files ------------------------------------------------------------------

function walk(p, out) {
    const st = fs.statSync(p);
    if (st.isDirectory()) {
        for (const n of fs.readdirSync(p)) walk(path.join(p, n), out);
    } else if (/\.(js|jsx)$/.test(p) && !p.includes(`${path.sep}i18n${path.sep}`)) {
        out.push(p);
    }
    return out;
}
const files = [];
for (const t of targets) walk(path.resolve(root, t), files);
if (flags.has('--all')) walk(path.join(root, 'src'), files);

const unescape = (s) => s.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n');
const T_CALL = /(?<![\w$.])t\(\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|`((?:\\.|[^`\\$])*)`)/g;
const PROP = /\b(?:label|tip|hint|title|name)\s*:\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")/g;

let checked = 0;
const seen = new Set();
for (const f of [...new Set(files)]) {
    const text = fs.readFileSync(f, 'utf8');
    const rel = path.relative(root, f);
    const lineOf = (i) => text.slice(0, i).split('\n').length;
    const scan = (re, label) => {
        for (const m of text.matchAll(re)) {
            const raw = m[1] ?? m[2] ?? m[3];
            if (raw === undefined || !/[A-Za-z]{2}/.test(raw)) continue;
            const key = unescape(raw);
            const tag = `${rel}:${key}`;
            if (label === 'prop' && seen.has(tag)) continue;
            seen.add(tag);
            checked++;
            const miss = LANGS.filter((l) => !merged[l][key]);
            if (miss.length) {
                console.log(`${label === 'prop' ? '[prop] ' : ''}${rel}:${lineOf(m.index)}  "${key}"  missing: ${miss.join(', ')}`);
                if (label !== 'prop') problems++;
            }
        }
    };
    scan(T_CALL, 'call');
    if (flags.has('--props')) scan(PROP, 'prop');
}

console.log(`checked ${checked} strings in ${new Set(files).size} files; ${problems} problem${problems === 1 ? '' : 's'}`);
process.exit(problems ? 1 : 0);
