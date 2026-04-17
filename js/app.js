import { logoutUser, watchAuthState } from "./auth.js";
import { createProcedure, getProcedures } from "./firestore.js";

const procedureForm = document.getElementById("procedureForm");
const proceduresList = document.getElementById("proceduresList");
const logoutBtn = document.getElementById("logoutBtn");
const currentUserBox = document.getElementById("currentUser");

const quill = new Quill("#stepsEditor", {
  theme: "snow",
  placeholder: "Escribe aquí los pasos del procedimiento y pega imágenes si lo necesitas...",
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

function escapeHtml(text) {
  if (!text) return "";
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getEditorHtml() {
  return quill.root.innerHTML.trim();
}

function isEditorEmpty() {
  const text = quill.getText().trim();
  const hasImages = quill.root.querySelector("img");
  return !text && !hasImages;
}

function resetEditor() {
  quill.setContents([]);
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
      return `
        <div class="procedure-row">
          <a class="procedure-list-link" href="./procedimiento.html?id=${encodeURIComponent(proc.id)}">
            ${escapeHtml(proc.title)}
          </a>
        </div>
      `;
    })
    .join("");
}

if (procedureForm) {
  procedureForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const title = document.getElementById("title").value.trim();
    const category = document.getElementById("category").value.trim();
    const description = document.getElementById("description").value.trim();
    const stepsHtml = getEditorHtml();
    const documentUrl = document.getElementById("documentUrl").value.trim();

    if (!title || !description || isEditorEmpty()) {
      alert("Título, descripción y pasos son obligatorios.");
      return;
    }

    const result = await createProcedure({
      title,
      category,
      description,
      stepsHtml,
      documentUrl
    });

    if (!result.ok) {
      alert(`Error al guardar: ${result.error}`);
      return;
    }

    procedureForm.reset();
    resetEditor();
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