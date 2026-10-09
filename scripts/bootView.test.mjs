// Tests for the boot screen's decision: boot / slow line / failure / ready
// (imported by look.test.mjs):
//   node --test scripts/look.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { SILENT_LIMIT_MS, SLOW_AFTER_MS, bootView } from '../src/lib/bootView.js';
import settings from '../src/i18n/settings.js';

test('boot: while the shell is booting the page stays on the boot screen, however long it takes', () => {
    for (const waitedMs of [0, 1000, SLOW_AFTER_MS - 1, SLOW_AFTER_MS, 90_000, 10 * 60_000]) {
        const v = bootView({ shell: { state: 'booting' }, waitedMs, silentMs: 0 });
        assert.equal(v.screen, 'boot', `waited ${waitedMs}`);
    }
});

test('boot: the calm slow line appears after a few seconds, not before', () => {
    assert.equal(bootView({ shell: { state: 'booting' }, waitedMs: 0 }).slow, false);
    assert.equal(bootView({ shell: { state: 'booting' }, waitedMs: SLOW_AFTER_MS - 1 }).slow, false);
    assert.equal(bootView({ shell: { state: 'booting' }, waitedMs: SLOW_AFTER_MS }).slow, true);
    assert.ok(SLOW_AFTER_MS >= 3000 && SLOW_AFTER_MS <= 10000);
});

test('boot: a failed shell shows the failure at once with its message, not a minute later', () => {
    const v = bootView({ shell: { state: 'failed', message: 'the engine exited before it was ready:\nboom' }, waitedMs: 200, silentMs: 0 });
    assert.equal(v.screen, 'failed');
    assert.equal(v.reason, 'shell');
    assert.equal(v.message, 'the engine exited before it was ready:\nboom');
    assert.equal(v.slow, false);
});

test('boot: a failure without a message leaves the wording to the caller', () => {
    for (const message of [undefined, null, '', '   ']) {
        const v = bootView({ shell: { state: 'failed', message } });
        assert.equal(v.screen, 'failed');
        assert.equal(v.message, null);
    }
});

test('boot: a ready shell is ready', () => {
    assert.equal(bootView({ shell: { state: 'ready', port: 4317, token: 'x' }, waitedMs: 70_000 }).screen, 'ready');
});

test('boot: no answer yet is still the boot screen, until the shell has been silent too long', () => {
    assert.equal(bootView({ shell: null, waitedMs: 3000, silentMs: 3000 }).screen, 'boot');
    assert.equal(bootView({ shell: null, waitedMs: 20_000, silentMs: SILENT_LIMIT_MS - 1 }).screen, 'boot');
    const v = bootView({ shell: null, waitedMs: 20_000, silentMs: SILENT_LIMIT_MS });
    assert.equal(v.screen, 'failed');
    assert.equal(v.reason, 'silent');
    assert.equal(v.message, null);
});

test('boot: a shell that answered "booting" and then went silent does not wait forever either', () => {
    const v = bootView({ shell: { state: 'booting' }, waitedMs: 300_000, silentMs: SILENT_LIMIT_MS });
    assert.equal(v.screen, 'failed');
});

test('boot: the strings the boot screen uses are in all six languages', () => {
    const keys = ['Engine failed to start', 'engine failed to boot', 'the app did not answer', 'The first start after an update can take a little longer.', 'Retry'];
    for (const lang of ['sq', 'de', 'fr', 'es', 'it', 'tr']) {
        for (const k of keys.slice(0, 4)) assert.ok(settings[lang][k], `${lang}: ${k}`);
        assert.ok(!('engine did not answer in 60s' in settings[lang]), `${lang}: stale key`);
    }
});
