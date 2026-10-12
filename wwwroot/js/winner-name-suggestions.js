(function () {
    'use strict';
    function currentLine(value, caret) {
        const start = value.lastIndexOf('\n', Math.max(0, caret - 1)) + 1;
        const next = value.indexOf('\n', caret);
        return { start: caret === 0 ? 0 : start, end: next < 0 ? value.length : next };
    }
    function replaceLine(value, caret, name) {
        const line = currentLine(value, caret);
        return { value: value.slice(0, line.start) + name + value.slice(line.end), caret: line.start + name.length };
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = { currentLine, replaceLine };
    if (typeof document === 'undefined') return;
    const source = document.getElementById('winner-name-options');
    if (!source) return;
    const names = JSON.parse(source.textContent);
    ['GoldWinnerName', 'SilverWinnerName', 'BronzeWinnerName'].forEach(id => {
        const input = document.getElementById(id);
        if (!input || input.readOnly) return;
        const list = document.createElement('div');
        list.id = id + '-suggestions';
        list.className = 'list-group mt-1 text-start';
        list.setAttribute('role', 'listbox');
        list.setAttribute('aria-label', 'Recorded winner names');
        list.hidden = true;
        input.insertAdjacentElement('afterend', list);
        const hint = document.createElement('small');
        hint.className = 'text-muted';
        hint.textContent = 'Type a name, then click a suggestion or use Arrow Down and Tab. Enter always starts a new player line.';
        list.insertAdjacentElement('afterend', hint);
        input.setAttribute('aria-controls', list.id);
        input.setAttribute('aria-autocomplete', 'list');
        let matches = [], active = -1;
        function close() { list.hidden = true; active = -1; input.removeAttribute('aria-activedescendant'); }
        function choose(name) {
            const replacement = replaceLine(input.value, input.selectionStart, name);
            input.value = replacement.value;
            input.focus();
            input.setSelectionRange(replacement.caret, replacement.caret);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            close();
        }
        function update() {
            const line = currentLine(input.value, input.selectionStart);
            const query = input.value.slice(line.start, input.selectionStart).trim().toLowerCase();
            list.replaceChildren();
            close();
            if (query.length < 2) return;
            const otherNames = (input.value.slice(0, line.start) + input.value.slice(line.end)).split(/\r?\n/).map(n => n.trim().toLowerCase());
            matches = names.filter(name => name.toLowerCase().includes(query) && !otherNames.includes(name.toLowerCase())).slice(0, 8);
            matches.forEach((name, index) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'list-group-item list-group-item-action';
                button.textContent = name;
                button.id = list.id + '-' + index;
                button.setAttribute('role', 'option');
                button.setAttribute('aria-selected', 'false');
                button.addEventListener('mousedown', event => event.preventDefault());
                button.addEventListener('click', () => choose(name));
                list.appendChild(button);
            });
            list.hidden = matches.length === 0;
        }
        input.addEventListener('input', update);
        input.addEventListener('click', update);
        input.addEventListener('keydown', event => {
            if (event.key === 'Escape' || event.key === 'Enter') { close(); return; }
            if (list.hidden) return;
            if (event.key === 'Tab' && active >= 0) { event.preventDefault(); choose(matches[active]); return; }
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            event.preventDefault();
            active = (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
            Array.from(list.children).forEach((button, index) => {
                button.classList.toggle('active', index === active);
                button.setAttribute('aria-selected', String(index === active));
            });
            input.setAttribute('aria-activedescendant', list.children[active].id);
        });
        input.addEventListener('blur', () => setTimeout(() => { if (!list.contains(document.activeElement)) close(); }, 150));
    });
})();
