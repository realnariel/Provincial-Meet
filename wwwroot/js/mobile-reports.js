(() => {
    const toggle = document.getElementById('mobileReportToggle');
    const panel = document.getElementById('mobileReportPanel');
    if (!toggle || !panel) return;
    function close() {
        panel.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
    }
    toggle.addEventListener('click', () => {
        const opening = panel.hidden;
        panel.hidden = !opening;
        toggle.setAttribute('aria-expanded', String(opening));
    });
    document.addEventListener('click', event => {
        if (!panel.contains(event.target) && !toggle.contains(event.target)) close();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !panel.hidden) { close(); toggle.focus(); }
    });
    document.addEventListener('focusin', event => {
        if (!panel.contains(event.target) && !toggle.contains(event.target)) close();
    });
    toggle.addEventListener('keydown', event => {
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            panel.hidden = false;
            toggle.setAttribute('aria-expanded', 'true');
            panel.querySelector('a')?.focus();
        }
    });
    const path = window.location.pathname.toLowerCase();
    panel.querySelectorAll('a').forEach(link => {
        if (new URL(link.href).pathname.toLowerCase() === path) {
            link.setAttribute('aria-current', 'page');
            toggle.classList.add('active');
        }
    });
})();
