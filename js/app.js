import { logoutUser, watchAuthState } from "./auth.js";
import {
  createProcedure,
  getProcedures,
  getProcedureById,
  updateProcedure
} from "./firestore.js";

const procedureForm = document.getElementById("procedureForm");
const proceduresList = document.getElementById("proceduresList");
const logoutBtn = document.getElementById("logoutBtn");
const currentUserBox = document.getElementById("currentUser");
const formTitle = document.getElementById("formTitle");
const submitBtn = document.getElementById("submitBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const editingIdInput = document.getElementById("editingId");

let proceduresCache = [];

function escapeHtml(text) {
  if (!text) return "";
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

async function loadProcedures() {
  proceduresList.innerHTML = "<p>Cargando procedimientos...</p>";

  const result = await getProcedures();

  if (!result.ok) {
    proceduresList.innerHTML = `<p>Error al cargar: ${escapeHtml(result.error)}</p>`;
    return;
  }

  proceduresCache = result.data;

  if (proceduresCache.length === 0) {
    proceduresList.innerHTML = "<p>No hay procedimientos todavía.</p>";
    return;
  }

  proceduresList.innerHTML = proceduresCache
    .map((proc) => {
      return `
        <div class="procedure-row">
          <a class="procedure-list-link" href="./procedimiento.html?id=${encodeURIComponent(proc.id)}">
            ${escapeHtml(proc.title)}
          </a>
          <button class="edit-inline-btn" data-id="${proc.id}" type="button">Editar</button>
        </div>
      `;
    })
    .join("");

  const editButtons = document.querySelectorAll(".edit-inline-btn");
  editButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const result = await getProcedureById(id);

      if (!result.ok) {
        alert(`Error al cargar el procedimiento: ${result.error}`);
        return;
      }

      fillForm(result.data);
    });
  });
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
    } else {
      result = await createProcedure(payload);
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

function getEditIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("edit") || "";
}

async function tryLoadEditFromUrl() {
  const editId = getEditIdFromUrl();

  if (!editId) return;

  const result = await getProcedureById(editId);

  if (!result.ok) {
    alert(`No se pudo cargar el procedimiento a editar: ${result.error}`);
    return;
  }

  fillForm(result.data);
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
    tryLoadEditFromUrl();
  }
});