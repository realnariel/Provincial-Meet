(() => {
    const stage = document.querySelector('.meet-poster-stage');
    const poster = stage?.querySelector('.meet-poster');
    if (!poster) return;
    let pending = false;
    function fit() {
        pending = false;
        const height = window.visualViewport?.height || window.innerHeight;
        const top = stage.getBoundingClientRect().top + window.scrollY;
        const nav = document.querySelector('.mobile-bottom-nav');
        let bottomSpace = 12;
        if (nav && getComputedStyle(nav).display !== 'none') {
            const rect = nav.getBoundingClientRect();
            // Only the horizontal bottom navigation consumes vertical space.
            if (rect.width > rect.height && rect.top > height / 2) {
                bottomSpace = Math.max(bottomSpace, window.innerHeight - rect.top + 12);
            }
        }
        let available = Math.max(180, height - top - bottomSpace);
        if (window.matchMedia('(max-width: 991.98px) and (orientation: landscape)').matches) {
            available = Math.max(200, Math.min(340, available));
        } else if (window.matchMedia('(min-width: 992px)').matches) {
            available = Math.max(400, Math.min(560, available * 0.75, stage.clientWidth * 0.65));
        }
        stage.closest('.row')?.style.setProperty('--home-banner-height', `${available}px`);
        stage.style.setProperty('--poster-available-height', `${available}px`);
        stage.style.setProperty('--poster-stage-height', `${available}px`);
        stage.classList.add('is-fitted');
    }
    function schedule() {
        if (!pending) { pending = true; requestAnimationFrame(fit); }
    }
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(stage);
    const header = document.querySelector('body > header');
    const nav = document.querySelector('.mobile-bottom-nav');
    if (header) observer.observe(header);
    if (nav) observer.observe(nav);
    document.fonts?.ready.then(schedule);
    schedule();
})();
