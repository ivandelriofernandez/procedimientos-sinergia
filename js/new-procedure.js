import { logoutUser, watchAuthState } from "./auth.js";
import { createProcedure } from "./firestore.js";

const logoutBtn = document.getElementById("logoutBtn");
const saveProcedureBtn = document.getElementById("saveProcedureBtn");
const currentUserBox = document.getElementById("currentUser");
const docNameDisplay = document.getElementById("docNameDisplay");
const titleInput = document.getElementById("title");
const saveMessage = document.getElementById("saveMessage");

// Actualiza el nombre del documento en la topbar al escribir el título
if (titleInput && docNameDisplay) {
  titleInput.addEventListener("input", () => {
    const val = titleInput.value.trim();
    docNameDisplay.textContent = val || "Nuevo procedimiento";
  });
}

// Inicializar Quill con la barra de herramientas personalizada del HTML
const quill = new Quill("#stepsEditor", {
  theme: "snow",
  placeholder: "Escribe aquí los pasos del procedimiento…",
  modules: {
    toolbar: "#quillToolbar"
  }
});

function isEditorEmpty() {
  const text = quill.getText().trim();
  const hasImages = quill.root.querySelector("img");
  return !text && !hasImages;
}

function showSaveMessage(text, isError = false) {
  if (!saveMessage) return;
  saveMessage.textContent = text;
  saveMessage.className = isError ? "word-save-message word-save-message--error" : "word-save-message word-save-message--ok";
  saveMessage.hidden = false;
  setTimeout(() => { saveMessage.hidden = true; }, 4000);
}

async function handleSave() {
  const title = titleInput ? titleInput.value.trim() : "";
  const category = document.getElementById("category")?.value.trim() || "";
  const description = document.getElementById("description")?.value.trim() || "";
  const stepsHtml = quill.root.innerHTML.trim();
  const documentUrl = document.getElementById("documentUrl")?.value.trim() || "";

  if (!title) {
    showSaveMessage("El título es obligatorio.", true);
    titleInput?.focus();
    return;
  }

  if (!description) {
    showSaveMessage("La descripción es obligatoria.", true);
    document.getElementById("description")?.focus();
    return;
  }

  if (isEditorEmpty()) {
    showSaveMessage("Los pasos son obligatorios.", true);
    return;
  }

  if (saveProcedureBtn) {
    saveProcedureBtn.disabled = true;
    saveProcedureBtn.textContent = "Guardando…";
  }

  const result = await createProcedure({
    title,
    category,
    description,
    stepsHtml,
    documentUrl
  });

  if (!result.ok) {
    showSaveMessage(`Error al guardar: ${result.error}`, true);
    if (saveProcedureBtn) {
      saveProcedureBtn.disabled = false;
      saveProcedureBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Guardar`;
    }
    return;
  }

  window.location.href = "./app.html";
}

if (saveProcedureBtn) {
  saveProcedureBtn.addEventListener("click", handleSave);
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
    currentUserBox.textContent = user.email;
  }
});