(() => {
    'use strict';
    let installEvent = null;
    const installed = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const key = 'cong-install-dismissed';
    const dismissed = () => {
        try { return Date.now() - Number(localStorage.getItem(key) || 0) < 7 * 24 * 60 * 60 * 1000; }
        catch { return false; }
    };
    const remember = () => {
        try { localStorage.setItem(key, String(Date.now())); } catch { /* Storage may be disabled. */ }
    };
    const update = () => {
        const button = document.getElementById('installAppButton');
        if (button) button.hidden = !installEvent;
        if (installEvent) document.getElementById('installAppHelp').textContent = 'Select Install app to confirm installation in your browser.';
    };
    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        installEvent = event;
        update();
    });
    window.addEventListener('appinstalled', () => {
        installEvent = null;
        remember();
        bootstrap.Modal.getInstance(document.getElementById('installAppModal'))?.hide();
    });
    document.addEventListener('DOMContentLoaded', () => {
        const element = document.getElementById('installAppModal');
        if (!element || installed()) return;
        const modal = bootstrap.Modal.getOrCreateInstance(element);
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        if (ios) document.getElementById('installAppHelp').textContent = 'In Safari, tap Share, then Add to Home Screen and confirm Add.';
        update();
        element.addEventListener('hidden.bs.modal', remember);
        document.getElementById('installAppButton').addEventListener('click', async () => {
            if (!installEvent) return;
            const event = installEvent;
            installEvent = null;
            update();
            try {
                await event.prompt();
                await event.userChoice;
                modal.hide();
            } catch {
                document.getElementById('installAppHelp').textContent = 'Use your browser’s menu to install this app or add it to your home screen.';
            }
        });
        if (!dismissed()) window.setTimeout(() => {
            if (!installed() && !document.querySelector('.modal.show')) modal.show();
        }, 1500);
    });
})();
