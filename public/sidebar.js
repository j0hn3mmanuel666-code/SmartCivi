const sidebar = document.getElementById('app-sidebar');

if (sidebar) {
  const body = document.body;
  const collapseButton = document.getElementById('app-sidebar-collapse');
  const mobileToggle = document.getElementById('app-sidebar-mobile-toggle');
  const backdrop = document.getElementById('app-sidebar-backdrop');
  const collapsedStorageKey = 'smartcivi-sidebar-collapsed';
  const collapseButtonIcon = collapseButton.querySelector('span');

  if (localStorage.getItem(collapsedStorageKey) === 'true') {
    body.classList.add('app-sidebar-collapsed');
    collapseButton.setAttribute('aria-expanded', 'false');
    collapseButton.setAttribute('aria-label', 'Expand navigation');
    collapseButtonIcon.textContent = '›';
  }

  const closeMobileSidebar = () => {
    body.classList.remove('app-sidebar-open');
    mobileToggle.setAttribute('aria-expanded', 'false');
    mobileToggle.setAttribute('aria-label', 'Open navigation');
    mobileToggle.firstElementChild.textContent = '☰';
  };

  collapseButton.addEventListener('click', () => {
    const collapsed = body.classList.toggle('app-sidebar-collapsed');
    collapseButton.setAttribute('aria-expanded', String(!collapsed));
    collapseButton.setAttribute('aria-label', collapsed ? 'Expand navigation' : 'Collapse navigation');
    collapseButtonIcon.textContent = collapsed ? '›' : '‹';
    localStorage.setItem(collapsedStorageKey, String(collapsed));
  });

  mobileToggle.addEventListener('click', () => {
    const open = body.classList.toggle('app-sidebar-open');
    mobileToggle.setAttribute('aria-expanded', String(open));
    mobileToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    mobileToggle.firstElementChild.textContent = open ? '×' : '☰';
  });

  backdrop.addEventListener('click', closeMobileSidebar);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMobileSidebar();
  });

  const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
  sidebar.querySelectorAll('.app-sidebar-link').forEach(link => {
    const linkPath = link.getAttribute('href').replace(/\/+$/, '') || '/';
    const label = link.dataset.label;
    if (label) {
      link.setAttribute('aria-label', label);
      link.title = label;
    }
    const isAdminLink = sidebar.querySelector('a[href="/admin/requests"]') !== null;
    const isRequestDetail = currentPath.startsWith('/request/');
    const isAdminRequestDetail = currentPath.startsWith('/admin/requests/');
    const isDashboardPage = currentPath === '/dashboard/requests';
    const isActive = currentPath === linkPath ||
      (isRequestDetail && (isAdminLink ? linkPath === '/admin/requests' : linkPath === '/dashboard/my-requests')) ||
      (isAdminRequestDetail && linkPath === '/admin/requests') ||
      (isDashboardPage && linkPath === '/dashboard/my-requests') ||
      (currentPath === '/status' && linkPath === '/dashboard/my-requests');
    if (isActive) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
  });
}
