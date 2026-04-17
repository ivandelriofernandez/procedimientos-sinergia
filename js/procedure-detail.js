import { logoutUser, watchAuthState } from "./auth.js";
import { getProcedureById, updateProcedure, deleteProcedure } from "./firestore.js";

const currentUserBox = document.getElementById("currentUser");
const procedureFullView = document.getElementById("procedureFullView");
const procedureEditPanel = document.getElementById("procedureEditPanel");
const logoutBtn = document.getElementById("logoutBtn");
const editProcedureBtn = document.getElementById("editProcedureBtn");
const deleteProcedureBtn = document.getElementById("deleteProcedureBtn");
const editProcedureForm = document.getElementById("editProcedureForm");
const cancelEditBtn = document.getElementById("cancelEditBtn");

let currentProcedure = null;

function escapeHtml(text) {
  if (!text) return "";
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeUrl(url) {
  if (!url) return "";
  const trimmed = url.trim();

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function getProcedureIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || "";
}

function renderProcedure(procedure) {
  const documentLink = procedure.documentUrl
    ? `<a class="doc-link" href="${escapeHtml(normalizeUrl(procedure.documentUrl))}" target="_blank" rel="noopener noreferrer">Abrir documento</a>`
    : "<span class='no-doc'>Sin documento enlazado</span>";

  procedureFullView.innerHTML = `
    <article class="procedure-full-card">
      <header class="procedure-full-header">
        <div>
          <h2>${escapeHtml(procedure.title)}</h2>
          <span class="badge">${escapeHtml(procedure.category || "Sin categoría")}</span>
        </div>
      </header>

      <section class="procedure-section">
        <h3>Descripción</h3>
        <p>${escapeHtml(procedure.description)}</p>
      </section>

      <section class="procedure-section">
        <h3>Pasos</h3>
        <pre>${escapeHtml(procedure.steps)}</pre>
      </section>

      <section class="procedure-section">
        <h3>Documento</h3>
        ${documentLink}
      </section>

      <section class="procedure-section">
        <h3>Imágenes</h3>
        <div class="image-placeholder">
          Aquí podrás mostrar imágenes del procedimiento más adelante.
        </div>
      </section>
    </article>
  `;
}

function fillEditForm(procedure) {
  document.getElementById("editTitle").value = procedure.title || "";
  document.getElementById("editCategory").value = procedure.category || "";
  document.getElementById("editDescription").value = procedure.description || "";
  document.getElementById("editSteps").value = procedure.steps || "";
  document.getElementById("editDocumentUrl").value = procedure.documentUrl || "";
}

function openEditMode() {
  if (!currentProcedure) return;
  fillEditForm(currentProcedure);
  procedureEditPanel.hidden = false;
  editProcedureBtn.hidden = true;
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
}

function closeEditMode() {
  procedureEditPanel.hidden = true;
  editProcedureBtn.hidden = false;
  editProcedureForm.reset();
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

if (editProcedureBtn) {
  editProcedureBtn.addEventListener("click", () => {
    openEditMode();
  });
}

if (cancelEditBtn) {
  cancelEditBtn.addEventListener("click", () => {
    closeEditMode();
  });
}

if (editProcedureForm) {
  editProcedureForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const id = getProcedureIdFromUrl();
    const title = document.getElementById("editTitle").value.trim();
    const category = document.getElementById("editCategory").value.trim();
    const description = document.getElementById("editDescription").value.trim();
    const steps = document.getElementById("editSteps").value.trim();
    const documentUrl = document.getElementById("editDocumentUrl").value.trim();

    if (!title || !description || !steps) {
      alert("Título, descripción y pasos son obligatorios.");
      return;
    }

    const result = await updateProcedure(id, {
      title,
      category,
      description,
      steps,
      documentUrl
    });

    if (!result.ok) {
      alert(`Error al actualizar: ${result.error}`);
      return;
    }

    const updated = await getProcedureById(id);

    if (!updated.ok) {
      alert(`Se guardó, pero no se pudo recargar el procedimiento: ${updated.error}`);
      return;
    }

    currentProcedure = updated.data;
    renderProcedure(currentProcedure);
    closeEditMode();
  });
}

if (deleteProcedureBtn) {
  deleteProcedureBtn.addEventListener("click", async () => {
    const id = getProcedureIdFromUrl();
    const confirmed = confirm("¿Seguro que quieres eliminar este procedimiento?");
    if (!confirmed) return;

    const deleteResult = await deleteProcedure(id);

    if (!deleteResult.ok) {
      alert(`Error al eliminar: ${deleteResult.error}`);
      return;
    }

    window.location.href = "./app.html";
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    const result = await logoutUser();

    if (!result.ok) {
      alert(`Error al cerrar sesión: ${result.error}`);
      return;
    }

    window.location.href = "index.html";
  });
}

watchAuthState((user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  if (currentUserBox) {
    currentUserBox.textContent = `Sesión iniciada: ${user.email}`;
  }

  loadProcedure();
});