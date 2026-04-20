import { logoutUser, watchAuthState } from "./auth.js";
import { getProcedureById, updateProcedure, deleteProcedure } from "./firestore.js";
import { initImageResizer } from "./image-resizer.js";
import { initThemeToggle } from "./theme.js";

initThemeToggle("themeBtn");

const currentUserBox     = document.getElementById("currentUser");
const procedureFullView  = document.getElementById("procedureFullView");
const procedureEditPanel = document.getElementById("procedureEditPanel");
const logoutBtn          = document.getElementById("logoutBtn");
const editProcedureBtn   = document.getElementById("editProcedureBtn");
const deleteProcedureBtn = document.getElementById("deleteProcedureBtn");
const editProcedureForm  = document.getElementById("editProcedureForm");
const cancelEditBtn      = document.getElementById("cancelEditBtn");

const editQuill = new Quill("#editStepsEditor", {
  theme: "snow",
  placeholder: "Edita aquí los pasos del procedimiento…",
  modules: {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ["bold", "italic", "underline", "strike"],
      [{ list: "ordered" }, { list: "bullet" }],
      ["blockquote", "code-block"],
      ["link", "image"],
      ["clean"]
    ]
  }
});

const editResizer = initImageResizer(editQuill);

let currentProcedure = null;

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeUrl(url) {
  if (!url) return "";
  const t = url.trim();
  return t.startsWith("http://") || t.startsWith("https://") ? t : `https://${t}`;
}

function getProcedureIdFromUrl() {
  return new URLSearchParams(window.location.search).get("id") || "";
}

function getStepsHtml(procedure) {
  if (procedure.stepsHtml) return procedure.stepsHtml;
  if (procedure.steps) return `<p>${escapeHtml(procedure.steps).replaceAll("\n", "<br>")}</p>`;
  return "<p></p>";
}

function formatTimestamp(ts) {
  if (!ts) return null;
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(d);
  } catch { return null; }
}

function renderProcedure(procedure) {
  const category = escapeHtml(procedure.category || "Sin categoría");
  const title    = escapeHtml(procedure.title);
  const desc     = escapeHtml(procedure.description);
  const dateStr  = formatTimestamp(procedure.updatedAt) || formatTimestamp(procedure.createdAt);

  const docChip = procedure.documentUrl
    ? `<a class="proc-ext-link"
          href="${escapeHtml(normalizeUrl(procedure.documentUrl))}"
          target="_blank" rel="noopener noreferrer">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        Documento externo
      </a>`
    : "";

  procedureFullView.innerHTML = `
    <article class="proc-view">
      <header class="proc-header">
        <div class="proc-meta-row">
          <span class="badge">${category}</span>
          ${dateStr ? `<time class="proc-date">Actualizado el ${dateStr}</time>` : ""}
          ${docChip}
        </div>
        <h2 class="proc-title">${title}</h2>
        <p class="proc-desc">${desc}</p>
      </header>
      <div class="proc-body">
        <p class="proc-steps-label">Pasos del procedimiento</p>
        <div class="rich-content">${getStepsHtml(procedure)}</div>
      </div>
    </article>
  `;
}

function fillEditForm(procedure) {
  document.getElementById("editTitle").value       = procedure.title       || "";
  document.getElementById("editCategory").value    = procedure.category    || "";
  document.getElementById("editDescription").value = procedure.description || "";
  document.getElementById("editDocumentUrl").value = procedure.documentUrl || "";
  editQuill.root.innerHTML = getStepsHtml(procedure);
}

function isEditEditorEmpty() {
  return !editQuill.getText().trim() && !editQuill.root.querySelector("img");
}

function openEditMode() {
  if (!currentProcedure) return;
  fillEditForm(currentProcedure);
  procedureEditPanel.hidden = false;
  editProcedureBtn.hidden   = true;
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
}

function closeEditMode() {
  editResizer.hide();
  procedureEditPanel.hidden = true;
  editProcedureBtn.hidden   = false;
  editProcedureForm.reset();
  editQuill.setContents([]);
}

async function loadProcedure() {
  const id = getProcedureIdFromUrl();
  if (!id) {
    procedureFullView.innerHTML = "<p>No se ha indicado ningún procedimiento.</p>";
    editProcedureBtn.disabled = true;
    deleteProcedureBtn.disabled = true;
    return;
  }

  const result = await getProcedureById(id);
  if (!result.ok) {
    procedureFullView.innerHTML = `<p>Error al cargar: ${escapeHtml(result.error)}</p>`;
    editProcedureBtn.disabled = true;
    deleteProcedureBtn.disabled = true;
    return;
  }

  currentProcedure = result.data;
  renderProcedure(currentProcedure);
}

editProcedureBtn?.addEventListener("click", openEditMode);
cancelEditBtn?.addEventListener("click", closeEditMode);

editProcedureForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id          = getProcedureIdFromUrl();
  const title       = document.getElementById("editTitle").value.trim();
  const category    = document.getElementById("editCategory").value.trim();
  const description = document.getElementById("editDescription").value.trim();
  const stepsHtml   = editQuill.root.innerHTML.trim();
  const documentUrl = document.getElementById("editDocumentUrl").value.trim();

  if (!title || !description || isEditEditorEmpty()) {
    alert("Título, descripción y pasos son obligatorios.");
    return;
  }

  const result = await updateProcedure(id, { title, category, description, stepsHtml, documentUrl });
  if (!result.ok) { alert(`Error al actualizar: ${result.error}`); return; }

  const updated = await getProcedureById(id);
  if (!updated.ok) { alert(`Se guardó pero no se pudo recargar: ${updated.error}`); return; }

  currentProcedure = updated.data;
  renderProcedure(currentProcedure);
  closeEditMode();
});

deleteProcedureBtn?.addEventListener("click", async () => {
  const id = getProcedureIdFromUrl();
  if (!confirm("¿Seguro que quieres eliminar este procedimiento?")) return;
  const deleteResult = await deleteProcedure(id);
  if (!deleteResult.ok) { alert(`Error al eliminar: ${deleteResult.error}`); return; }
  window.location.href = "./app.html";
});

logoutBtn?.addEventListener("click", async () => {
  const result = await logoutUser();
  if (!result.ok) { alert(`Error al cerrar sesión: ${result.error}`); return; }
  window.location.href = "index.html";
});

watchAuthState((user) => {
  if (!user) { window.location.href = "index.html"; return; }
  if (currentUserBox) currentUserBox.textContent = `Sesión iniciada: ${user.email}`;
  loadProcedure();
});