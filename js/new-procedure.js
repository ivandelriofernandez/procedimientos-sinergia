import { logoutUser, watchAuthState } from "./auth.js";
import { createProcedure } from "./firestore.js";

const procedureForm = document.getElementById("procedureForm");
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

function isEditorEmpty() {
  const text = quill.getText().trim();
  const hasImages = quill.root.querySelector("img");
  return !text && !hasImages;
}

function resetEditor() {
  quill.setContents([]);
}

if (procedureForm) {
  procedureForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const title = document.getElementById("title").value.trim();
    const category = document.getElementById("category").value.trim();
    const description = document.getElementById("description").value.trim();
    const stepsHtml = quill.root.innerHTML.trim();
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

    const createdId = result.id;

    procedureForm.reset();
    resetEditor();

    window.location.href = `./procedimiento.html?id=${encodeURIComponent(createdId)}`;
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
});