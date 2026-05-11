import { logoutUser, watchAuthState } from "./auth.js";
import { createProcedure, getProcedures } from "./firestore.js";
import { initImageResizer } from "./image-resizer.js";
import { initThemeToggle } from "./theme.js";

initThemeToggle("themeBtn");

/* ── PDF.js worker ── */
// Necesario para que PDF.js funcione en el navegador sin bloquear la UI
if (typeof pdfjsLib !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

/* ── DOM ── */
const logoutBtn        = document.getElementById("logoutBtn");
const saveProcedureBtn = document.getElementById("saveProcedureBtn");
const currentUserBox   = document.getElementById("currentUser");
const docNameDisplay   = document.getElementById("docNameDisplay");
const titleInput       = document.getElementById("title");
const saveMessage      = document.getElementById("saveMessage");

const categorySelect   = document.getElementById("categorySelect");
const newCatWrap       = document.getElementById("newCatWrap");
const categoryNew      = document.getElementById("categoryNew");
const cancelNewCat     = document.getElementById("cancelNewCat");

const pdfInput         = document.getElementById("pdfInput");
const pdfBtnLabel      = document.getElementById("pdfBtnLabel");
const pdfProgress      = document.getElementById("pdfProgress");
const pdfProgressFill  = document.getElementById("pdfProgressFill");
const pdfProgressText  = document.getElementById("pdfProgressText");

const NEW_VALUE = "__new__";

/* ══════════════════════════════════════════════════════
   CATEGORY SELECT
══════════════════════════════════════════════════════ */
async function loadCategories() {
  const result = await getProcedures();
  const categories = new Set();

  if (result.ok) {
    result.data.forEach(p => {
      const cat = (p.category || "").trim();
      if (cat) categories.add(cat);
    });
  }

  const sorted = [...categories].sort((a, b) => a.localeCompare(b, "es"));
  categorySelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = ""; placeholder.disabled = true; placeholder.selected = true;
  placeholder.textContent = "Selecciona una categoría…";
  categorySelect.appendChild(placeholder);

  sorted.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat; opt.textContent = cat;
    categorySelect.appendChild(opt);
  });

  if (sorted.length > 0) {
    const sep = document.createElement("option");
    sep.disabled = true; sep.textContent = "──────────────";
    categorySelect.appendChild(sep);
  }

  const newOpt = document.createElement("option");
  newOpt.value = NEW_VALUE; newOpt.textContent = "+ Nueva categoría…";
  categorySelect.appendChild(newOpt);
}

categorySelect.addEventListener("change", () => {
  if (categorySelect.value === NEW_VALUE) {
    newCatWrap.hidden = false;
    categoryNew.value = ""; categoryNew.focus();
  } else {
    newCatWrap.hidden = true; categoryNew.value = "";
  }
});

cancelNewCat.addEventListener("click", () => {
  newCatWrap.hidden = true; categoryNew.value = "";
  categorySelect.options[0].selected = true;
});

function getCategory() {
  return categorySelect.value === NEW_VALUE
    ? categoryNew.value.trim()
    : categorySelect.value.trim();
}

/* ══════════════════════════════════════════════════════
   TITLE → DOC NAME
══════════════════════════════════════════════════════ */
if (titleInput && docNameDisplay) {
  titleInput.addEventListener("input", () => {
    docNameDisplay.textContent = titleInput.value.trim() || "Nuevo procedimiento";
  });
}

/* ══════════════════════════════════════════════════════
   QUILL
══════════════════════════════════════════════════════ */
const quill = new Quill("#stepsEditor", {
  theme: "snow",
  placeholder: "Escribe aquí los pasos del procedimiento…",
  modules: { toolbar: "#quillToolbar" }
});

initImageResizer(quill);

function isEditorEmpty() {
  return !quill.getText().trim() && !quill.root.querySelector("img");
}

/* ══════════════════════════════════════════════════════
   PDF IMPORT — extracción local con PDF.js
══════════════════════════════════════════════════════ */

/** Actualiza la barra de progreso (0-100) */
function setProgress(pct, label) {
  pdfProgressFill.style.width = `${pct}%`;
  if (label) pdfProgressText.textContent = label;
}

/** Extrae el texto de un PDF página a página usando PDF.js */
async function extractTextFromPdf(file) {
  if (typeof pdfjsLib === "undefined") {
    throw new Error("PDF.js no está disponible. Comprueba la conexión a internet.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;

  const pageBlocks = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    setProgress(
      Math.round((pageNum / totalPages) * 85),
      `Procesando página ${pageNum} de ${totalPages}…`
    );

    const page        = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    if (textContent.items.length === 0) continue;

    /* Agrupar items en líneas por posición Y (redondeada a 1 decimal) */
    const lineMap = new Map();

    textContent.items.forEach(item => {
      if (!item.str) return;
      const y = Math.round(item.transform[5] * 10) / 10;
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y).push(item);
    });

    /* Ordenar líneas de arriba a abajo (Y mayor = más arriba en PDF) */
    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);

    const lines = sortedYs.map(y => {
      const items = lineMap.get(y).sort((a, b) => a.transform[4] - b.transform[4]);
      return items.map(i => i.str).join(" ").trim();
    }).filter(l => l.length > 0);

    if (lines.length > 0) {
      pageBlocks.push({ page: pageNum, lines });
    }
  }

  return pageBlocks;
}

/** Convierte los bloques de texto en HTML estructurado para Quill */
function blocksToHtml(pageBlocks) {
  if (pageBlocks.length === 0) return "";

  const allLines = pageBlocks.flatMap(block => block.lines);

  /* Heurística sencilla: línea es título si es corta, está en mayúsculas
     o va seguida de un salto de párrafo */
  const htmlParts = [];
  let i = 0;

  while (i < allLines.length) {
    const line = allLines[i];
    const next = allLines[i + 1] || "";

    const isShort        = line.length < 80;
    const isAllCaps      = line === line.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(line);
    const nextIsEmpty    = next.trim() === "";
    const prevIsEmpty    = i === 0 || allLines[i - 1].trim() === "";
    const looksLikeTitle = isShort && (isAllCaps || (prevIsEmpty && nextIsEmpty));

    if (looksLikeTitle && line.length > 2) {
      htmlParts.push(`<h3>${escHtml(line)}</h3>`);
    } else if (line.trim() === "") {
      /* línea vacía → separador entre párrafos, ya manejado implícitamente */
    } else {
      /* Detectar si la línea es item de lista (empieza por -, •, *, número+punto) */
      const bulletMatch = line.match(/^[-•*]\s+(.+)/);
      const numMatch    = line.match(/^(\d+)[.)]\s+(.+)/);

      if (bulletMatch) {
        htmlParts.push(`<ul><li>${escHtml(bulletMatch[1])}</li></ul>`);
      } else if (numMatch) {
        htmlParts.push(`<ol><li>${escHtml(numMatch[2])}</li></ol>`);
      } else {
        htmlParts.push(`<p>${escHtml(line)}</p>`);
      }
    }

    i++;
  }

  /* Fusionar listas consecutivas del mismo tipo */
  return mergeConsecutiveLists(htmlParts.join(""));
}

/** Une <ul><li>…</li></ul><ul><li>…</li></ul> en una sola <ul> */
function mergeConsecutiveLists(html) {
  return html
    .replace(/<\/ul>\s*<ul>/g, "")
    .replace(/<\/ol>\s*<ol>/g, "");
}

function escHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Orquesta la importación completa */
async function handlePdfImport(file) {
  if (!file || file.type !== "application/pdf") {
    showSaveMessage("El archivo seleccionado no es un PDF válido.", true);
    return;
  }

  if (file.size > 30 * 1024 * 1024) {
    showSaveMessage("El PDF es demasiado grande (máximo 30 MB).", true);
    return;
  }

  /* UI: inicio */
  pdfBtnLabel.classList.add("pdf-import-btn--loading");
  pdfBtnLabel.setAttribute("aria-disabled", "true");
  pdfProgress.hidden = false;
  setProgress(0, "Cargando PDF…");

  try {
    const pageBlocks = await extractTextFromPdf(file);

    setProgress(90, "Generando contenido…");

    if (pageBlocks.length === 0) {
      showSaveMessage(
        "No se encontró texto en el PDF. Es posible que sea un PDF de imágenes escaneadas sin OCR.",
        true
      );
      return;
    }

    const html = blocksToHtml(pageBlocks);
    setProgress(100, "¡Listo!");

    /* Insertar en Quill — si el editor tiene contenido, añadir al final */
    const currentContent = quill.root.innerHTML.trim();
    const isEmpty = isEditorEmpty();

    if (isEmpty) {
      quill.clipboard.dangerouslyPasteHTML(html);
    } else {
      /* Añadir separador + nuevo contenido al final */
      const combined = currentContent + "<p><br></p><hr><p><br></p>" + html;
      quill.clipboard.dangerouslyPasteHTML(combined);
    }

    /* Autocompletar título si está vacío */
    if (titleInput && !titleInput.value.trim()) {
      const nameWithoutExt = file.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " ");
      titleInput.value = nameWithoutExt.charAt(0).toUpperCase() + nameWithoutExt.slice(1);
      docNameDisplay.textContent = titleInput.value;
    }

    const pages = pageBlocks.length;
    showSaveMessage(
      `PDF importado correctamente (${pages} página${pages !== 1 ? "s" : ""}).`,
      false
    );

  } catch (err) {
    console.error("Error al leer el PDF:", err);
    showSaveMessage(`Error al leer el PDF: ${err.message}`, true);
  } finally {
    /* UI: fin */
    pdfBtnLabel.classList.remove("pdf-import-btn--loading");
    pdfBtnLabel.removeAttribute("aria-disabled");
    setTimeout(() => { pdfProgress.hidden = true; setProgress(0, ""); }, 1800);
    /* Reset input para permitir subir el mismo archivo otra vez */
    pdfInput.value = "";
  }
}

/* Escuchar selección de archivo */
pdfInput?.addEventListener("change", () => {
  if (pdfInput.files[0]) handlePdfImport(pdfInput.files[0]);
});

/* ══════════════════════════════════════════════════════
   DRAG & DROP sobre la zona del editor
══════════════════════════════════════════════════════ */
const editorContainer = document.getElementById("stepsEditor");

function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

["dragenter", "dragover"].forEach(evt =>
  editorContainer?.addEventListener(evt, e => {
    preventDefaults(e);
    if (e.dataTransfer?.types?.includes("Files")) {
      editorContainer.classList.add("pdf-dragover");
    }
  })
);

["dragleave", "drop"].forEach(evt =>
  editorContainer?.addEventListener(evt, e => {
    preventDefaults(e);
    editorContainer.classList.remove("pdf-dragover");
  })
);

editorContainer?.addEventListener("drop", e => {
  preventDefaults(e);
  editorContainer.classList.remove("pdf-dragover");
  const file = e.dataTransfer?.files?.[0];
  if (file?.type === "application/pdf") {
    handlePdfImport(file);
  }
});

/* ══════════════════════════════════════════════════════
   SAVE MESSAGE
══════════════════════════════════════════════════════ */
function showSaveMessage(text, isError = false) {
  if (!saveMessage) return;
  saveMessage.textContent = text;
  saveMessage.className   = isError
    ? "word-save-message word-save-message--error"
    : "word-save-message word-save-message--ok";
  saveMessage.hidden = false;
  setTimeout(() => { saveMessage.hidden = true; }, 5000);
}

/* ══════════════════════════════════════════════════════
   GUARDAR PROCEDIMIENTO
══════════════════════════════════════════════════════ */
async function handleSave() {
  const title       = titleInput?.value.trim() || "";
  const category    = getCategory();
  const description = document.getElementById("description")?.value.trim() || "";
  const stepsHtml   = quill.root.innerHTML.trim();
  const documentUrl = document.getElementById("documentUrl")?.value.trim() || "";

  if (!title) {
    showSaveMessage("El título es obligatorio.", true);
    titleInput?.focus(); return;
  }

  if (!category) {
    showSaveMessage(
      categorySelect.value === NEW_VALUE
        ? "Escribe el nombre de la nueva categoría."
        : "Selecciona una categoría.",
      true
    );
    categorySelect.value === NEW_VALUE ? categoryNew.focus() : categorySelect.focus();
    return;
  }

  if (!description) {
    showSaveMessage("La descripción es obligatoria.", true);
    document.getElementById("description")?.focus(); return;
  }

  if (isEditorEmpty()) {
    showSaveMessage("Los pasos son obligatorios.", true); return;
  }

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

saveProcedureBtn?.addEventListener("click", handleSave);

/* ══════════════════════════════════════════════════════
   LOGOUT / AUTH
══════════════════════════════════════════════════════ */
logoutBtn?.addEventListener("click", async () => {
  const result = await logoutUser();
  if (!result.ok) { alert(`Error al cerrar sesión: ${result.error}`); return; }
  window.location.href = "index.html";
});

watchAuthState((user) => {
  if (!user) { window.location.href = "index.html"; return; }
  if (currentUserBox) currentUserBox.textContent = user.email;
  loadCategories();
});