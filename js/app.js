import { logoutUser, watchAuthState } from "./auth.js";
import {
  createProcedure,
  getProcedures,
  deleteProcedure
} from "./firestore.js";

const procedureForm = document.getElementById("procedureForm");
const proceduresList = document.getElementById("proceduresList");
const logoutBtn = document.getElementById("logoutBtn");
const currentUserBox = document.getElementById("currentUser");

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

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://")
  ) {
    return trimmed;
  }

  return `https://${trimmed}`;
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
            <button class="danger-btn" data-id="${proc.id}">Eliminar</button>
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

      await loadProcedures();
    });
  });
}

if (procedureForm) {
  procedureForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const title = document.getElementById("title").value.trim();
    const category = document.getElementById("category").value.trim();
    const description = document.getElementById("description").value.trim();
    const steps = document.getElementById("steps").value.trim();
    const documentUrl = document.getElementById("documentUrl").value.trim();

    if (!title || !description || !steps) {
      alert("Título, descripción y pasos son obligatorios.");
      return;
    }

    const result = await createProcedure({
      title,
      category,
      description,
      steps,
      documentUrl
    });

    if (!result.ok) {
      alert(`Error al guardar: ${result.error}`);
      return;
    }

    procedureForm.reset();
    await loadProcedures();
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
    loadProcedures();
  }
});