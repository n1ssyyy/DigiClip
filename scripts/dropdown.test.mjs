// Tests for the keyboard of the app's dropdown list: stepping over disabled
// options, the end keys, typed letters (accents, repeats, a word) and the
// typing buffer.
//   node --test scripts/dropdown.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { TYPE_MS, extendTyped, findTyped, isTyping, isTypeKey, optionIndex, stepOption } from '../src/lib/dropdown.js';

const o = (text, extra = {}) => ({ value: text.toLowerCase(), text, ...extra });
const LANGS = [o('Auto-detect'), o('English'), o('Español'), o('Deutsch'), o('Dutch'), o('Türkçe'), o('Chinese'), o('Czech')];

test('optionIndex matches a number and its string', () => {
    const opts = [{ value: 1, text: '1 clip' }, { value: 5, text: '5 clips' }];
    assert.equal(optionIndex(opts, '5'), 1);
    assert.equal(optionIndex(opts, 1), 0);
    assert.equal(optionIndex(opts, 9), -1);
    assert.equal(optionIndex([], 'x'), -1);
});

test('stepOption: arrows move by one and stop at the ends', () => {
    assert.equal(stepOption(LANGS, 0, 'ArrowDown'), 1);
    assert.equal(stepOption(LANGS, 3, 'ArrowUp'), 2);
    assert.equal(stepOption(LANGS, 0, 'ArrowUp'), 0);
    assert.equal(stepOption(LANGS, LANGS.length - 1, 'ArrowDown'), LANGS.length - 1);
});

test('stepOption: nothing active yet starts at an end', () => {
    assert.equal(stepOption(LANGS, -1, 'ArrowDown'), 0);
    assert.equal(stepOption(LANGS, -1, 'ArrowUp'), LANGS.length - 1);
});

test('stepOption: Home, End and the page keys', () => {
    assert.equal(stepOption(LANGS, 4, 'Home'), 0);
    assert.equal(stepOption(LANGS, 4, 'End'), LANGS.length - 1);
    assert.equal(stepOption(LANGS, 4, 'PageUp'), 0);
    assert.equal(stepOption(LANGS, 4, 'PageDown'), LANGS.length - 1);
});

test('stepOption: disabled options are skipped', () => {
    const opts = [o('A', { disabled: true }), o('B'), o('C', { disabled: true }), o('D'), o('E', { disabled: true })];
    assert.equal(stepOption(opts, 1, 'ArrowDown'), 3);
    assert.equal(stepOption(opts, 3, 'ArrowUp'), 1);
    assert.equal(stepOption(opts, 3, 'ArrowDown'), 3);
    assert.equal(stepOption(opts, 1, 'ArrowUp'), 1);
    assert.equal(stepOption(opts, 2, 'Home'), 1);
    assert.equal(stepOption(opts, 2, 'End'), 3);
    // Standing on a disabled current choice, arrows still leave it.
    assert.equal(stepOption(opts, 2, 'ArrowDown'), 3);
    assert.equal(stepOption(opts, 2, 'ArrowUp'), 1);
});

test('stepOption: other keys and empty or all-disabled lists give null', () => {
    assert.equal(stepOption(LANGS, 0, 'a'), null);
    assert.equal(stepOption(LANGS, 0, 'Enter'), null);
    assert.equal(stepOption([], 0, 'ArrowDown'), null);
    assert.equal(stepOption([o('A', { disabled: true })], 0, 'ArrowDown'), null);
});

test('findTyped: a letter jumps to the next option that starts with it', () => {
    assert.equal(findTyped(LANGS, 'e', 0), 1);
    assert.equal(findTyped(LANGS, 'T', 0), 5);
    assert.equal(findTyped(LANGS, 'q', 0), -1);
});

test('findTyped: the same letter again steps through the matches and wraps', () => {
    assert.equal(findTyped(LANGS, 'd', 0), 3);
    assert.equal(findTyped(LANGS, 'd', 3), 4);
    assert.equal(findTyped(LANGS, 'd', 4), 3);
    assert.equal(findTyped(LANGS, 'dd', 3), 4);
});

test('findTyped: a longer word narrows and keeps the option it is on', () => {
    assert.equal(findTyped(LANGS, 'du', 3), 4);
    assert.equal(findTyped(LANGS, 'ch', 3), 6);
    assert.equal(findTyped(LANGS, 'ch', 6), 6);
    assert.equal(findTyped(LANGS, 'cz', 6), 7);
});

test('findTyped: accents and case do not matter, in the text or the keys', () => {
    assert.equal(findTyped(LANGS, 'es', 0), 2);
    assert.equal(findTyped(LANGS, 'turk', 0), 5);
    assert.equal(findTyped(LANGS, 'TÜR', 0), 5);
    assert.equal(findTyped([o('Čeština')], 'ce', -1), 0);
});

test('findTyped: a space is part of a word, not a start', () => {
    const opts = [o('Haitian Creole'), o('Hawaiian'), o('Hebrew')];
    assert.equal(findTyped(opts, 'haitian c', 1), 0);
    assert.equal(findTyped(opts, ' ', 0), -1);
});

test('findTyped: disabled options are never found; empty text finds nothing', () => {
    const opts = [o('Alpha'), o('Apple', { disabled: true }), o('Avocado')];
    assert.equal(findTyped(opts, 'a', 0), 2);
    assert.equal(findTyped(opts, 'ap', 0), -1);
    assert.equal(findTyped(opts, '', 0), -1);
    assert.equal(findTyped([], 'a', -1), -1);
});

test('extendTyped builds a word and starts again after a pause', () => {
    let t = { text: '', at: 0 };
    t = extendTyped(t, 'd', 1000);
    t = extendTyped(t, 'u', 1300);
    assert.equal(t.text, 'du');
    t = extendTyped(t, 'x', 1300 + TYPE_MS + 1);
    assert.equal(t.text, 'x');
});

test('isTyping is true only inside the pause window', () => {
    const t = { text: 'ab', at: 1000 };
    assert.equal(isTyping(t, 1000 + TYPE_MS), true);
    assert.equal(isTyping(t, 1000 + TYPE_MS + 1), false);
    assert.equal(isTyping({ text: '', at: 0 }, 5), false);
});

test('isTypeKey: letters and the space, not shortcuts or named keys', () => {
    assert.equal(isTypeKey({ key: 'a' }), true);
    assert.equal(isTypeKey({ key: ' ' }), true);
    assert.equal(isTypeKey({ key: 'a', ctrlKey: true }), false);
    assert.equal(isTypeKey({ key: 'Enter' }), false);
    assert.equal(isTypeKey({ key: 'ArrowDown' }), false);
});
