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
const logoutBtn = document.getElementById("logoutBtn");
const currentUserBox = document.getElementById("currentUser");
const formTitle = document.getElementById("formTitle");
const submitBtn = document.getElementById("submitBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const editingIdInput = document.getElementById("editingId");

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

async function startEditProcedure(id) {
  const result = await getProcedureById(id);

  if (!result.ok) {
    alert(`Error al cargar el procedimiento: ${result.error}`);
    return;
  }

  fillForm(result.data);
}

async function loadProcedures() {
  proceduresList.innerHTML = "<p>Cargando procedimientos...</p>";

  const result = await getProcedures();

  if (!result.ok) {
    proceduresList.innerHTML = `<p>Error al cargar: ${escapeHtml(result.error)}</p>`;
    return;
  }

  if (result.data.length === 0) {
    proceduresList.innerHTML = "<p>No hay procedimientos todavía.</p>";
    return;
  }

  proceduresList.innerHTML = result.data
    .map((proc) => {
      const documentLink = proc.documentUrl
        ? `<a class="doc-link" href="${escapeHtml(normalizeUrl(proc.documentUrl))}" target="_blank" rel="noopener noreferrer">Abrir documento</a>`
        : "<span class='no-doc'>Sin documento enlazado</span>";

      return `
        <article class="procedure-card">
          <div class="procedure-card-header">
            <div>
              <h3>${escapeHtml(proc.title)}</h3>
              <span class="badge">${escapeHtml(proc.category || "Sin categoría")}</span>
            </div>
            <div class="card-actions">
              <button class="edit-btn" data-id="${proc.id}" type="button">Editar</button>
              <button class="danger-btn" data-id="${proc.id}" type="button">Eliminar</button>
            </div>
          </div>

          <p><strong>Descripción:</strong> ${escapeHtml(proc.description)}</p>
          <p><strong>Pasos:</strong></p>
          <pre>${escapeHtml(proc.steps)}</pre>

          <div class="procedure-card-footer">
            ${documentLink}
          </div>
        </article>
      `;
    })
    .join("");

  const deleteButtons = document.querySelectorAll(".danger-btn");
  deleteButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const confirmed = confirm("¿Seguro que quieres eliminar este procedimiento?");
      if (!confirmed) return;

      const result = await deleteProcedure(id);

      if (!result.ok) {
        alert(`Error al eliminar: ${result.error}`);
        return;
      }

      if (editingIdInput.value === id) {
        setFormModeCreate();
      }

      await loadProcedures();
    });
  });

  const editButtons = document.querySelectorAll(".edit-btn");
  editButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      await startEditProcedure(id);
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