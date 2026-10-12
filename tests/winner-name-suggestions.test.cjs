const { test } = require('node:test');
const assert = require('node:assert/strict');
const { currentLine, replaceLine } = require('../wwwroot/js/winner-name-suggestions.js');

test('choosing a suggestion preserves the players before and after the active line', () => {
    const value = 'Alex One\nBe\nChris Three';
    assert.deepEqual(replaceLine(value, 11, 'Bea Two'), {
        value: 'Alex One\nBea Two\nChris Three', caret: 16
    });
});

test('choosing a suggestion after Enter keeps the existing roster', () => {
    assert.deepEqual(replaceLine('Alex One\n', 9, 'Bea Two'), {
        value: 'Alex One\nBea Two', caret: 16
    });
});

test('the first and last player lines can both be replaced', () => {
    assert.equal(replaceLine('Al\nBea Two', 2, 'Alex One').value, 'Alex One\nBea Two');
    assert.equal(replaceLine('Alex One\nBe', 11, 'Bea Two').value, 'Alex One\nBea Two');
});

test('a caret at the start of a blank line does not replace the following player', () => {
    assert.deepEqual(currentLine('\nBea Two', 0), { start: 0, end: 0 });
    assert.equal(replaceLine('\nBea Two', 0, 'Alex One').value, 'Alex One\nBea Two');
});

test('an empty field supports its first player', () => {
    assert.deepEqual(replaceLine('', 0, 'Alex One'), { value: 'Alex One', caret: 8 });
});
