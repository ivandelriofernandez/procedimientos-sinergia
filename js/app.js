import { logoutUser, watchAuthState } from "./auth.js";
import { getProcedures } from "./firestore.js";

const listEl        = document.getElementById("proceduresList");
const logoutBtn     = document.getElementById("logoutBtn");
const currentUserBox = document.getElementById("currentUser");
const searchInput   = document.getElementById("searchInput");
const clearSearch   = document.getElementById("clearSearch");
const categoryNav   = document.getElementById("categoryNav");
const statTotal     = document.getElementById("statTotal");

let allProcedures   = [];
let activeCategory  = "all";
let searchQuery     = "";

/* ── Helpers ── */

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getExcerpt(html, maxLen = 110) {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const text = tmp.textContent || tmp.innerText || "";
  return text.length > maxLen ? text.slice(0, maxLen).trimEnd() + "…" : text;
}

function normalizeCategory(cat) {
  return (cat || "Sin categoría").trim() || "Sin categoría";
}

/* ── Build category sidebar ── */

function buildSidebar(procedures) {
  const counts = {};
  procedures.forEach(p => {
    const cat = normalizeCategory(p.category);
    counts[cat] = (counts[cat] || 0) + 1;
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  const allBtn = buildCatBtn("all", "Todos", procedures.length, activeCategory === "all");
  const catBtns = sorted.map(([cat, n]) => buildCatBtn(cat, cat, n, activeCategory === cat));

  categoryNav.innerHTML = `<p class="sidebar-nav-label">Categorías</p>`;
  categoryNav.appendChild(allBtn);
  if (sorted.length > 0) {
    const divider = document.createElement("hr");
    divider.className = "sidebar-divider";
    categoryNav.appendChild(divider);
    catBtns.forEach(b => categoryNav.appendChild(b));
  }
}

function buildCatBtn(value, label, count, isActive) {
  const btn = document.createElement("button");
  btn.className = "cat-btn" + (isActive ? " cat-btn--active" : "");
  btn.dataset.cat = value;
  btn.innerHTML = `
    <span class="cat-btn-label">${escapeHtml(label)}</span>
    <span class="cat-btn-count">${count}</span>
  `;
  btn.addEventListener("click", () => {
    activeCategory = value;
    buildSidebar(allProcedures);
    render();
  });
  return btn;
}

/* ── Render procedure cards ── */

function render() {
  const q = searchQuery.toLowerCase();

  let filtered = allProcedures.filter(p => {
    const matchCat = activeCategory === "all" || normalizeCategory(p.category) === activeCategory;
    const matchSearch = !q
      || p.title.toLowerCase().includes(q)
      || (p.description || "").toLowerCase().includes(q)
      || normalizeCategory(p.category).toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  if (filtered.length === 0) {
    const msg = q
      ? `No hay resultados para "<strong>${escapeHtml(searchQuery)}</strong>"`
      : "No hay procedimientos en esta categoría.";
    listEl.className = "proc-grid";
    listEl.innerHTML = `<p class="list-placeholder">${msg}</p>`;
    return;
  }

  /* Group by category only when viewing "Todos" and no search */
  if (activeCategory === "all" && !q) {
    renderGrouped(filtered);
  } else {
    renderFlat(filtered);
  }
}

function renderGrouped(procedures) {
  const groups = {};
  procedures.forEach(p => {
    const cat = normalizeCategory(p.category);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(p);
  });

  const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  listEl.className = "proc-grid";
  listEl.innerHTML = sorted.map(([cat, items]) => `
    <section class="proc-group">
      <h3 class="proc-group-title">
        <span class="proc-group-name">${escapeHtml(cat)}</span>
        <span class="proc-group-count">${items.length}</span>
      </h3>
      <div class="proc-cards">
        ${items.map(cardHtml).join("")}
      </div>
    </section>
  `).join("");
}

function renderFlat(procedures) {
  listEl.className = "proc-grid";
  listEl.innerHTML = `
    <div class="proc-cards">
      ${procedures.map(cardHtml).join("")}
    </div>
  `;
}

function cardHtml(proc) {
  const excerpt = escapeHtml(getExcerpt(proc.stepsHtml || proc.description));
  const cat = escapeHtml(normalizeCategory(proc.category));
  const title = escapeHtml(proc.title);
  const hasDoc = !!proc.documentUrl;

  return `
    <a class="proc-card" href="./procedimiento.html?id=${encodeURIComponent(proc.id)}">
      <div class="proc-card-top">
        <h4 class="proc-card-title">${title}</h4>
        ${hasDoc ? `<span class="proc-card-doc-icon" title="Tiene documento externo">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </span>` : ""}
      </div>
      ${excerpt ? `<p class="proc-card-excerpt">${excerpt}</p>` : ""}
      <div class="proc-card-footer">
        <span class="proc-card-cat">${cat}</span>
        <span class="proc-card-arrow">→</span>
      </div>
    </a>
  `;
}

/* ── Load ── */

async function loadProcedures() {
  listEl.innerHTML = `<p class="list-placeholder">Cargando procedimientos…</p>`;

  const result = await getProcedures();

  if (!result.ok) {
    listEl.innerHTML = `<p class="list-placeholder list-placeholder--error">Error al cargar: ${escapeHtml(result.error)}</p>`;
    return;
  }

  allProcedures = result.data;

  statTotal.textContent = `${allProcedures.length} procedimiento${allProcedures.length !== 1 ? "s" : ""}`;

  buildSidebar(allProcedures);
  render();
}

/* ── Search ── */

searchInput?.addEventListener("input", () => {
  searchQuery = searchInput.value;
  clearSearch.hidden = !searchQuery;
  render();
});

clearSearch?.addEventListener("click", () => {
  searchInput.value = "";
  searchQuery = "";
  clearSearch.hidden = true;
  searchInput.focus();
  render();
});

/* ── Logout ── */

logoutBtn?.addEventListener("click", async () => {
  const result = await logoutUser();
  if (!result.ok) { alert(`Error al cerrar sesión: ${result.error}`); return; }
  window.location.href = "index.html";
});

/* ── Auth ── */

watchAuthState((user) => {
  if (!user) { window.location.href = "index.html"; return; }
  if (currentUserBox) currentUserBox.textContent = `Sesión iniciada: ${user.email}`;
  loadProcedures();
});