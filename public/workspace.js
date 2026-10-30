const rows = [...document.querySelectorAll("#requestRows tr[data-status]")];
const search = document.getElementById("requestSearch");
const filter = document.getElementById("requestFilter");
const count = document.getElementById("requestCount");
const empty = document.getElementById("requestEmpty");

const applyFilters = () => {
  const query = search.value.trim().toLowerCase();
  let visible = 0;
  for (const row of rows) {
    const matchesText = row.textContent.toLowerCase().includes(query);
    const matchesStatus = filter.value === "all" || row.dataset.status === filter.value;
    row.hidden = !(matchesText && matchesStatus);
    if (!row.hidden) visible += 1;
  }
  count.textContent = String(visible);
  empty.hidden = visible !== 0 || rows.length === 0;
};

if (search && filter) {
  search.addEventListener("input", applyFilters);
  filter.addEventListener("change", applyFilters);
  applyFilters();
}

const requestLink = document.querySelector('.nav-link[href="/dashboard#requests"]');
const overviewLink = document.querySelector('.nav-link[href="/dashboard"]');
const updateRequestNavigation = () => {
  const requestsSelected = window.location.pathname === "/dashboard" && window.location.hash === "#requests";
  requestLink?.classList.toggle("active", requestsSelected);
  overviewLink?.classList.toggle("active", window.location.pathname === "/dashboard" && !requestsSelected);
};

window.addEventListener("hashchange", updateRequestNavigation);
updateRequestNavigation();

document.getElementById("mobileMenu")?.addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
});
