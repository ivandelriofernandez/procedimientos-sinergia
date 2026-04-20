import { logoutUser, watchAuthState } from "./auth.js";
import { createProcedure } from "./firestore.js";
import { initImageResizer } from "./image-resizer.js";

const logoutBtn        = document.getElementById("logoutBtn");
const saveProcedureBtn = document.getElementById("saveProcedureBtn");
const currentUserBox   = document.getElementById("currentUser");
const docNameDisplay   = document.getElementById("docNameDisplay");
const titleInput       = document.getElementById("title");
const saveMessage      = document.getElementById("saveMessage");

/* Actualiza nombre del documento en la topbar */
if (titleInput && docNameDisplay) {
  titleInput.addEventListener("input", () => {
    docNameDisplay.textContent = titleInput.value.trim() || "Nuevo procedimiento";
  });
}

/* Quill — toolbar vinculada al ribbon del HTML */
const quill = new Quill("#stepsEditor", {
  theme: "snow",
  placeholder: "Escribe aquí los pasos del procedimiento…",
  modules: { toolbar: "#quillToolbar" }
});

/* Image resizer */
initImageResizer(quill);

function isEditorEmpty() {
  return !quill.getText().trim() && !quill.root.querySelector("img");
}

function showSaveMessage(text, isError = false) {
  if (!saveMessage) return;
  saveMessage.textContent = text;
  saveMessage.className = isError
    ? "word-save-message word-save-message--error"
    : "word-save-message word-save-message--ok";
  saveMessage.hidden = false;
  setTimeout(() => { saveMessage.hidden = true; }, 4500);
}

// ---------------------------------
// Arreglar color

function sanitizeEditorHtml(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  // Recorre todos los nodos con atributo style
  wrapper.querySelectorAll("[style]").forEach((el) => {
    el.style.removeProperty("color");
    el.style.removeProperty("background");
    el.style.removeProperty("background-color");

    // Si tras limpiar no queda ningún estilo, elimina el atributo style
    if (!el.getAttribute("style")?.trim()) {
      el.removeAttribute("style");
    }
  });

  // Elimina clases de Quill relacionadas con color/fondo si existieran
  wrapper.querySelectorAll("*").forEach((el) => {
    el.classList.forEach((cls) => {
      if (cls.startsWith("ql-color-") || cls.startsWith("ql-bg-")) {
        el.classList.remove(cls);
      }
    });

    if (!el.className.trim()) {
      el.removeAttribute("class");
    }
  });

  return wrapper.innerHTML.trim();
}




// ---------------------------------

async function handleSave() {
  const title       = titleInput?.value.trim() || "";
  const category    = document.getElementById("category")?.value.trim() || "";
  const description = document.getElementById("description")?.value.trim() || "";
  // const stepsHtml   = quill.root.innerHTML.trim();
  const rawStepsHtml = quill.root.innerHTML.trim();
  const stepsHtml    = sanitizeEditorHtml(rawStepsHtml);
  const documentUrl = document.getElementById("documentUrl")?.value.trim() || "";

  if (!title)          { showSaveMessage("El título es obligatorio.", true); titleInput?.focus(); return; }
  if (!description)    { showSaveMessage("La descripción es obligatoria.", true); document.getElementById("description")?.focus(); return; }
  if (isEditorEmpty()) { showSaveMessage("Los pasos son obligatorios.", true); return; }

  if (saveProcedureBtn) {
    saveProcedureBtn.disabled = true;
    saveProcedureBtn.textContent = "Guardando…";
  }

  const result = await createProcedure({ title, category, description, stepsHtml, documentUrl });

  if (!result.ok) {
    showSaveMessage(`Error al guardar: ${result.error}`, true);
    if (saveProcedureBtn) {
      saveProcedureBtn.disabled = false;
      saveProcedureBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg> Guardar`;
    }
    return;
  }

  window.location.href = "./app.html";
}

if (saveProcedureBtn) saveProcedureBtn.addEventListener("click", handleSave);

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    const result = await logoutUser();
    if (!result.ok) { alert(`Error al cerrar sesión: ${result.error}`); return; }
    window.location.href = "index.html";
  });
}

watchAuthState((user) => {
  if (!user) { window.location.href = "index.html"; return; }
  if (currentUserBox) currentUserBox.textContent = user.email;
});