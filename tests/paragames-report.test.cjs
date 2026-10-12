const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the report's actual browser code with a minimal document.
const view = fs.readFileSync(path.join(__dirname, '../Views/Home/GeneralOfficialReport.cshtml'), 'utf8');
const script = view.slice(view.indexOf('// Function to dynamically append'), view.lastIndexOf('</script>'));
function generate(rawTallies) {
    const elements = new Map();
    const element = () => ({ style: {}, innerHTML: '', children: [], appendChild(child) { this.children.push(child); } });
    const document = {
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, element());
            return elements.get(id);
        },
        querySelectorAll() { return [{ querySelector() { return { value: 'Test signatory' }; } }]; },
        createElement: element,
    };
    const context = vm.createContext({ rawTallies, document });
    vm.runInContext(script + '\ngenerateReport();', context);
    return id => (elements.get(id)?.children ?? []).map(row =>
        [...row.innerHTML.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map(match => match[1]));
}

const districts = ['Calape', 'Loon North', 'Loon South', 'Tubigon East', 'Tubigon West'];
const fixture = districts.flatMap((name, i) => [
    { name, division: 'Elementary', gold: i + 1, silver: 1, bronze: 2 },
    { name, division: 'Secondary', gold: i + 2, silver: 2, bronze: 1 },
    { name, division: 'Paragames', gold: 100 - i, silver: 30, bronze: 20 },
]);

test('five districts have three separate division tables and Elementary + Secondary overall totals', () => {
    const rows = generate(fixture);
    for (const division of ['elementary', 'secondary', 'paragames', 'overall']) {
        assert.equal(rows(division + '-tbody').length, 5);
    }
    assert.deepEqual(rows('overall-tbody')[0], ['1', 'Tubigon West', '11', '3', '3', '17']);
    assert.deepEqual(rows('paragames-tbody')[0], ['1', 'Calape', '100', '30', '20', '150']);
});

test('changing Paragames medals cannot alter overall ranks or totals', () => {
    const original = generate(fixture)('overall-tbody');
    const changed = fixture.map(row => row.division === 'Paragames' ? { ...row, gold: 9999 } : row);
    assert.deepEqual(generate(changed)('overall-tbody'), original);
});

test('Paragames-only districts never appear in Overall', () => {
    const rows = generate([{ name: 'Para-only district', division: 'Paragames', gold: 1, silver: 0, bronze: 0 }]);
    assert.equal(rows('overall-tbody').length, 0);
    assert.equal(rows('paragames-tbody').length, 1);
});

test('an empty meet renders every table without errors', () => {
    const rows = generate([]);
    for (const division of ['elementary', 'secondary', 'paragames', 'overall']) {
        assert.equal(rows(division + '-tbody').length, 0);
    }
});
