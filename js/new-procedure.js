import { logoutUser, watchAuthState } from "./auth.js";
import { createProcedure, getProcedures } from "./firestore.js";
import { initImageResizer } from "./image-resizer.js";
import { initThemeToggle } from "./theme.js";

initThemeToggle("themeBtn");

/* ── PDF.js: apunta al worker en el mismo CDN ── */
if (typeof pdfjsLib !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

/* ── Configuración de renderizado ── */
const PDF_SCALE   = 2.0;   // Resolución (2x = ~144 DPI, nítido en pantalla)
const JPEG_Q      = 0.88;  // Calidad JPEG 0-1 (0.88 equilibra calidad/tamaño)
const PAGE_WARN   = 8;     // Aviso si el PDF tiene más páginas que esto

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
   PDF IMPORT — renderizado de páginas como imágenes
══════════════════════════════════════════════════════ */

function setProgress(pct, label) {
  if (pdfProgressFill) pdfProgressFill.style.width = `${pct}%`;
  if (pdfProgressText && label) pdfProgressText.textContent = label;
}

/**
 * Renderiza cada página del PDF en un <canvas> y la devuelve
 * como Data URL JPEG. Preserva exactamente el aspecto visual:
 * texto, imágenes embebidas, tablas, colores, etc.
 */
async function renderPdfAsImages(file) {
  if (typeof pdfjsLib === "undefined") {
    throw new Error("PDF.js no está disponible. Comprueba la conexión.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });

  /* Progreso de carga del propio PDF */
  loadingTask.onProgress = ({ loaded, total }) => {
    if (total > 0) {
      setProgress(Math.round((loaded / total) * 15), "Cargando PDF…");
    }
  };

  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  /* Aviso si el PDF es muy largo */
  if (totalPages > PAGE_WARN) {
    const ok = confirm(
      `Este PDF tiene ${totalPages} páginas.\n\n` +
      `Importar muchas páginas genera imágenes pesadas que podrían ` +
      `superar el límite de almacenamiento por procedimiento.\n\n` +
      `¿Continuar de todas formas?`
    );
    if (!ok) return null;
  }

  const pageImages = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    /* Progreso: páginas representan del 15 % al 95 % */
    setProgress(
      15 + Math.round(((pageNum - 1) / totalPages) * 80),
      `Renderizando página ${pageNum} de ${totalPages}…`
    );

    const page = await pdf.getPage(pageNum);

    /* Viewport escalado para mayor resolución */
    const viewport = page.getViewport({ scale: PDF_SCALE });

    const canvas = document.createElement("canvas");
    canvas.width  = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext("2d");

    /* Fondo blanco explícito (PDFs con fondo transparente) */
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    /* Convertir a JPEG para reducir tamaño */
    pageImages.push({
      dataUrl : canvas.toDataURL("image/jpeg", JPEG_Q),
      width   : viewport.width,
      height  : viewport.height,
    });

    /* Liberar memoria del canvas */
    canvas.width = 0;
    canvas.height = 0;
  }

  return pageImages;
}

/**
 * Construye el HTML que se insertará en Quill:
 * cada página es una imagen con su ancho natural limitado al 100 %.
 */
function pagesToHtml(pageImages) {
  return pageImages
    .map(({ dataUrl }, i) => {
      const alt = `Página ${i + 1}`;
      return `<p><img src="${dataUrl}" alt="${alt}" style="max-width:100%;display:block;border-radius:4px;box-shadow:0 2px 10px rgba(0,0,0,0.08);margin:0 auto 12px;" /></p>`;
    })
    .join("\n");
}

/* ── Orquestador principal ── */
async function handlePdfImport(file) {
  if (!file || file.type !== "application/pdf") {
    showSaveMessage("El archivo seleccionado no es un PDF válido.", true);
    return;
  }

  if (file.size > 50 * 1024 * 1024) {
    showSaveMessage("El PDF supera los 50 MB. Usa un PDF más pequeño.", true);
    return;
  }

  /* UI: inicio */
  setPdfBusy(true);
  pdfProgress.hidden = false;
  setProgress(0, "Preparando…");

  try {
    const pageImages = await renderPdfAsImages(file);

    if (pageImages === null) {
      /* Usuario canceló el aviso de páginas */
      return;
    }

    if (pageImages.length === 0) {
      showSaveMessage("El PDF no tiene páginas renderizables.", true);
      return;
    }

    setProgress(95, "Insertando en el editor…");

    const html = pagesToHtml(pageImages);

    /* Si el editor ya tiene contenido, añadir al final con separador */
    if (isEditorEmpty()) {
      quill.clipboard.dangerouslyPasteHTML(html);
    } else {
      const current = quill.root.innerHTML;
      quill.clipboard.dangerouslyPasteHTML(
        current + `<p><br></p><p style="text-align:center;color:#82a8c2;font-size:12px;">— PDF importado —</p>` + html
      );
    }

    setProgress(100, "¡Listo!");

    /* Autocompletar título si estaba vacío */
    if (titleInput && !titleInput.value.trim()) {
      const name = file.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " ");
      titleInput.value = name.charAt(0).toUpperCase() + name.slice(1);
      docNameDisplay.textContent = titleInput.value;
    }

    const n = pageImages.length;
    showSaveMessage(
      `PDF importado con formato e imágenes (${n} página${n !== 1 ? "s" : ""}).`,
      false
    );

  } catch (err) {
    console.error("Error al importar PDF:", err);
    showSaveMessage(`Error al importar el PDF: ${err.message}`, true);
  } finally {
    setPdfBusy(false);
    setTimeout(() => {
      pdfProgress.hidden = true;
      setProgress(0, "");
    }, 2000);
    pdfInput.value = ""; /* Permite re-importar el mismo archivo */
  }
}

function setPdfBusy(busy) {
  if (!pdfBtnLabel) return;
  pdfBtnLabel.classList.toggle("pdf-import-btn--loading", busy);
  pdfBtnLabel.setAttribute("aria-disabled", busy ? "true" : "false");
}

/* ── File input ── */
pdfInput?.addEventListener("change", () => {
  if (pdfInput.files[0]) handlePdfImport(pdfInput.files[0]);
});

/* ── Drag & drop sobre el editor ── */
const editorEl = document.getElementById("stepsEditor");

function prevent(e) { e.preventDefault(); e.stopPropagation(); }

["dragenter", "dragover"].forEach(ev =>
  editorEl?.addEventListener(ev, e => {
    prevent(e);
    if (e.dataTransfer?.types?.includes("Files"))
      editorEl.classList.add("pdf-dragover");
  })
);

["dragleave", "drop"].forEach(ev =>
  editorEl?.addEventListener(ev, e => {
    prevent(e);
    editorEl.classList.remove("pdf-dragover");
  })
);

editorEl?.addEventListener("drop", e => {
  prevent(e);
  editorEl.classList.remove("pdf-dragover");
  const f = e.dataTransfer?.files?.[0];
  if (f?.type === "application/pdf") handlePdfImport(f);
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
        : "Selecciona una categoría.", true
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
    saveProcedureBtn.disabled    = true;
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