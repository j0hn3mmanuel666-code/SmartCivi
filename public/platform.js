(() => {
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
  document.querySelectorAll('.office-nav a').forEach(a => {
    if (location.pathname === a.pathname || (a.pathname !== '/admin' && location.pathname.startsWith(a.pathname + '/'))) a.setAttribute('aria-current', 'page');
  });
  document.querySelectorAll('form[data-confirm]').forEach(form => form.addEventListener('submit', event => { if (!confirm(form.dataset.confirm)) event.preventDefault(); }));
  document.querySelectorAll('form[data-save]').forEach(form => form.addEventListener('submit', () => { const button = form.querySelector('button[type=submit]'); if (button) { button.disabled = true; button.textContent = 'Saving…'; } }));
  document.querySelectorAll('[data-print]').forEach(button => button.addEventListener('click', () => window.print()));
})();
