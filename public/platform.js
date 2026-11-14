(() => {
  document.querySelectorAll('[data-password-toggle]').forEach(button => {
    const field = document.getElementById(button.getAttribute('aria-controls'));
    if (!field) return;
    button.hidden = false;
    button.addEventListener('click', () => {
      const show = field.type === 'password';
      field.type = show ? 'text' : 'password';
      button.textContent = show ? 'Hide' : 'Show';
      button.setAttribute('aria-pressed', String(show));
      button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });
  const csrf = () => document.querySelector('meta[name="csrf-token"]')?.content;
  const nativeFetch = window.fetch;
  window.fetch = (input, options = {}) => {
    if (options.body instanceof FormData && [...options.body.values()].every(value => typeof value === 'string')) options = { ...options, body: new URLSearchParams(options.body) };
    const url = new URL(input instanceof Request ? input.url : input, location.href);
    const method = (options.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (url.origin === location.origin && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const headers = new Headers(options.headers || (input instanceof Request ? input.headers : undefined));
      headers.set('X-CSRF-Token', csrf() || '');
      options = { ...options, headers };
    }
    return nativeFetch(input, options);
  };
  document.querySelectorAll('.office-nav').forEach(nav => {
    const links = [...nav.querySelectorAll('a')];
    const matches = links.filter(a => location.pathname === a.pathname || (a.pathname !== '/admin' && location.pathname.startsWith(a.pathname + '/')));
    const longest = Math.max(0, ...matches.map(a => a.pathname.length));
    matches.filter(a => a.pathname.length === longest).forEach(a => a.setAttribute('aria-current', 'page'));
  });
  const sidebar = document.querySelector('.workspace-sidebar');
  const sidebarToggle = document.querySelector('[data-sidebar-toggle]');
  if (sidebar && sidebarToggle) {
    const mobile = window.matchMedia('(max-width: 1023px)');
    const backdrop = document.querySelector('.workspace-backdrop');
    let open = false, previousOverflow = '', backgroundState = [];
    let desktopCollapsed = false;
    try { desktopCollapsed = localStorage.getItem('smartcivi.sidebar.collapsed') === 'true'; } catch {}
    const syncDesktopState = () => {
      document.documentElement.classList.toggle('sidebar-collapsed', desktopCollapsed);
      sidebarToggle.setAttribute('aria-expanded', String(mobile.matches ? open : !desktopCollapsed));
      sidebarToggle.setAttribute('aria-label', mobile.matches || desktopCollapsed ? 'Open navigation' : 'Collapse navigation');
      if (!mobile.matches && desktopCollapsed) sidebar.setAttribute('aria-hidden', 'true');
      else if (!mobile.matches) sidebar.removeAttribute('aria-hidden');
    };
    sidebarToggle.hidden = false;
    document.querySelector('.workspace-header')?.setAttribute('data-enhanced', '');
    const closeSidebar = (restoreFocus = true) => {
      if (open) {
        open = false;
        document.body.classList.remove('sidebar-open');
        document.body.style.overflow = previousOverflow;
        backgroundState.forEach(([element, inert]) => { element.inert = inert; });
        backgroundState = [];
        backdrop.hidden = true;
        sidebarToggle.setAttribute('aria-expanded', 'false');
        if (restoreFocus && mobile.matches) sidebarToggle.focus();
      }
      sidebar.removeAttribute('role');
      sidebar.removeAttribute('aria-modal');
      if (mobile.matches) sidebar.setAttribute('aria-hidden', 'true');
      else sidebar.removeAttribute('aria-hidden');
      syncDesktopState();
    };
    const openSidebar = () => {
      if (!mobile.matches || open) return;
      open = true;
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      document.body.classList.add('sidebar-open');
      backdrop.hidden = false;
      sidebar.removeAttribute('aria-hidden');
      sidebar.setAttribute('role', 'dialog');
      sidebar.setAttribute('aria-modal', 'true');
      sidebarToggle.setAttribute('aria-expanded', 'true');
      sidebarToggle.setAttribute('aria-label', 'Close navigation');
      backgroundState = [...document.querySelectorAll('body > header, body > main, body > footer, body > section')].map(element => [element, element.inert]);
      backgroundState.forEach(([element]) => { element.inert = true; });
      sidebar.querySelector('[data-sidebar-close]').focus();
    };
    sidebarToggle.addEventListener('click', () => {
      if (mobile.matches) return openSidebar();
      desktopCollapsed = !desktopCollapsed;
      try { localStorage.setItem('smartcivi.sidebar.collapsed', String(desktopCollapsed)); } catch {}
      syncDesktopState();
    });
    document.querySelectorAll('[data-sidebar-close]').forEach(element => element.addEventListener('click', () => closeSidebar()));
    sidebar.querySelectorAll('a').forEach(link => link.addEventListener('click', () => closeSidebar(false)));
    document.addEventListener('keydown', event => {
      if (!open) return;
      if (event.key === 'Escape') { event.preventDefault(); closeSidebar(); return; }
      if (event.key === 'Tab') {
        const elements = [...sidebar.querySelectorAll('a[href],button:not(:disabled)')].filter(element => element.getClientRects().length);
        const first = elements[0], last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    mobile.addEventListener('change', () => closeSidebar(false));
    closeSidebar(false);
  }
  document.querySelectorAll('.badge').forEach(badge => { badge.dataset.state = badge.textContent.trim().toLowerCase(); });
  document.addEventListener('pointerdown', event => {
    document.querySelectorAll('.nav-more[open], .mobile-menu[open]').forEach(menu => { if (!menu.contains(event.target)) menu.open = false; });
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const menus = [...document.querySelectorAll('.mobile-menu[open], .nav-more[open]')].filter(menu => menu.getClientRects().length);
    const menu = menus.at(-1);
    if (menu) { menu.open = false; menu.querySelector('summary').focus(); event.preventDefault(); }
  });
  const tables = [...document.querySelectorAll('.table-wrap')].map(wrapper => {
    const hint = document.createElement('p');
    hint.className = 'table-scroll-hint';
    hint.textContent = 'More columns are available. Swipe or use the arrow keys to scroll.';
    hint.hidden = true;
    wrapper.before(hint);
    return { wrapper, hint };
  });
  let tableFrame;
  const updateTables = () => {
    cancelAnimationFrame(tableFrame);
    tableFrame = requestAnimationFrame(() => {
      const overflow = tables.map(({ wrapper }) => wrapper.scrollWidth > wrapper.clientWidth + 1);
      tables.forEach(({ wrapper, hint }, index) => {
        hint.hidden = !overflow[index];
        if (overflow[index]) { wrapper.tabIndex = 0; wrapper.setAttribute('role', 'region'); wrapper.setAttribute('aria-label', 'Scrollable records table'); }
        else { wrapper.removeAttribute('tabindex'); wrapper.removeAttribute('role'); wrapper.removeAttribute('aria-label'); }
      });
    });
  };
  updateTables();
  window.addEventListener('resize', updateTables, { passive: true });
  document.querySelectorAll('form[data-confirm]').forEach(form => form.addEventListener('submit', event => { if (!confirm(form.dataset.confirm)) event.preventDefault(); }));
  document.querySelectorAll('form[data-save]').forEach(form => form.addEventListener('submit', () => { const button = form.querySelector('button[type=submit]'); if (button) { button.disabled = true; button.textContent = 'Saving…'; } }));
  document.querySelectorAll('[data-print]').forEach(button => button.addEventListener('click', () => window.print()));
})();
