import { logoutUser, watchAuthState } from "./auth.js";
import {
  createProcedure,
  getProcedures,
  getProcedureById,
  updateProcedure,
  deleteProcedure
} from "./firestore.js";

const procedureForm = document.getElementById("procedureForm");
const proceduresList = document.getElementById("proceduresList");
const procedureDetail = document.getElementById("procedureDetail");
const logoutBtn = document.getElementById("logoutBtn");
const currentUserBox = document.getElementById("currentUser");
const formTitle = document.getElementById("formTitle");
const submitBtn = document.getElementById("submitBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const editingIdInput = document.getElementById("editingId");

let proceduresCache = [];
let selectedProcedureId = "";

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

function setFormModeCreate() {
  editingIdInput.value = "";
  formTitle.textContent = "Nuevo procedimiento";
  submitBtn.textContent = "Guardar procedimiento";
  cancelEditBtn.hidden = true;
  procedureForm.reset();
}

function fillForm(procedure) {
  document.getElementById("title").value = procedure.title || "";
  document.getElementById("category").value = procedure.category || "";
  document.getElementById("description").value = procedure.description || "";
  document.getElementById("steps").value = procedure.steps || "";
  document.getElementById("documentUrl").value = procedure.documentUrl || "";
  editingIdInput.value = procedure.id || "";

  formTitle.textContent = "Editar procedimiento";
  submitBtn.textContent = "Guardar cambios";
  cancelEditBtn.hidden = false;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderProcedureDetail(procedure) {
  if (!procedure) {
    procedureDetail.className = "procedure-detail empty-detail";
    procedureDetail.innerHTML = "<p>Selecciona un procedimiento para ver el detalle.</p>";
    return;
  }

  const documentLink = procedure.documentUrl
    ? `<a class="doc-link" href="${escapeHtml(normalizeUrl(procedure.documentUrl))}" target="_blank" rel="noopener noreferrer">Abrir documento</a>`
    : "<span class='no-doc'>Sin documento enlazado</span>";

  procedureDetail.className = "procedure-detail";
  procedureDetail.innerHTML = `
    <div class="detail-header">
      <div>
        <h3>${escapeHtml(procedure.title)}</h3>
        <span class="badge">${escapeHtml(procedure.category || "Sin categoría")}</span>
      </div>

      <div class="card-actions">
        <button class="edit-btn" id="detailEditBtn" type="button">Editar</button>
        <button class="danger-btn" id="detailDeleteBtn" type="button">Eliminar</button>
      </div>
    </div>

    <div class="detail-block">
      <h4>Descripción</h4>
      <p>${escapeHtml(procedure.description)}</p>
    </div>

    <div class="detail-block">
      <h4>Pasos</h4>
      <pre>${escapeHtml(procedure.steps)}</pre>
    </div>

    <div class="detail-block">
      <h4>Documento</h4>
      ${documentLink}
    </div>
  `;

  const detailEditBtn = document.getElementById("detailEditBtn");
  const detailDeleteBtn = document.getElementById("detailDeleteBtn");

  detailEditBtn.addEventListener("click", () => {
    fillForm(procedure);
  });

  detailDeleteBtn.addEventListener("click", async () => {
    const confirmed = confirm("¿Seguro que quieres eliminar este procedimiento?");
    if (!confirmed) return;

    const result = await deleteProcedure(procedure.id);

    if (!result.ok) {
      alert(`Error al eliminar: ${result.error}`);
      return;
    }

    if (editingIdInput.value === procedure.id) {
      setFormModeCreate();
    }

    selectedProcedureId = "";
    await loadProcedures();
  });
}

function renderProceduresList() {
  if (proceduresCache.length === 0) {
    proceduresList.innerHTML = "<p>No hay procedimientos todavía.</p>";
    renderProcedureDetail(null);
    return;
  }

  proceduresList.innerHTML = proceduresCache
    .map((proc) => {
      const activeClass = proc.id === selectedProcedureId ? "procedure-list-item active" : "procedure-list-item";

      return `
        <button class="${activeClass}" data-id="${proc.id}" type="button">
          ${escapeHtml(proc.title)}
        </button>
      `;
    })
    .join("");

  const listButtons = document.querySelectorAll(".procedure-list-item");
  listButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      selectedProcedureId = id;

      renderProceduresList();

      const result = await getProcedureById(id);

      if (!result.ok) {
        renderProcedureDetail(null);
        alert(`Error al cargar el detalle: ${result.error}`);
        return;
      }

      renderProcedureDetail(result.data);
    });
  });

  if (!selectedProcedureId && proceduresCache.length > 0) {
    selectedProcedureId = proceduresCache[0].id;
    renderProceduresList();
    renderProcedureDetail(proceduresCache[0]);
    return;
  }

  const selectedProcedure = proceduresCache.find((item) => item.id === selectedProcedureId);
  if (selectedProcedure) {
    renderProcedureDetail(selectedProcedure);
  }
}

async function loadProcedures() {
  proceduresList.innerHTML = "<p>Cargando procedimientos...</p>";

  const result = await getProcedures();

  if (!result.ok) {
    proceduresList.innerHTML = `<p>Error al cargar: ${escapeHtml(result.error)}</p>`;
    renderProcedureDetail(null);
    return;
  }

  proceduresCache = result.data;

  if (
    selectedProcedureId &&
    !proceduresCache.some((item) => item.id === selectedProcedureId)
  ) {
    selectedProcedureId = "";
  }

  renderProceduresList();
}

if (procedureForm) {
  procedureForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const id = editingIdInput.value.trim();
    const title = document.getElementById("title").value.trim();
    const category = document.getElementById("category").value.trim();
    const description = document.getElementById("description").value.trim();
    const steps = document.getElementById("steps").value.trim();
    const documentUrl = document.getElementById("documentUrl").value.trim();

    if (!title || !description || !steps) {
      alert("Título, descripción y pasos son obligatorios.");
      return;
    }

    const payload = {
      title,
      category,
      description,
      steps,
      documentUrl
    };

    let result;

    if (id) {
      result = await updateProcedure(id, payload);
      selectedProcedureId = id;
    } else {
      result = await createProcedure(payload);
      if (result.ok) {
        selectedProcedureId = result.id;
      }
    }

    if (!result.ok) {
      alert(`Error al guardar: ${result.error}`);
      return;
    }

    setFormModeCreate();
    await loadProcedures();
  });
}

if (cancelEditBtn) {
  cancelEditBtn.addEventListener("click", () => {
    setFormModeCreate();
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
    if (!window.location.pathname.endsWith("index.html")) {
      window.location.href = "index.html";
    }
    return;
  }

  if (currentUserBox) {
    currentUserBox.textContent = `Sesión iniciada: ${user.email}`;
  }

  if (proceduresList) {
    setFormModeCreate();
    loadProcedures();
  }
});