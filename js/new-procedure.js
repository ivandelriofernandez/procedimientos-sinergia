import { logoutUser, watchAuthState } from "./auth.js";
import { createProcedure, getProcedures } from "./firestore.js";
import { initImageResizer } from "./image-resizer.js";
import { initThemeToggle } from "./theme.js";

initThemeToggle("themeBtn");

/* ── PDF.js worker ── */
if (typeof pdfjsLib !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

const PAGE_WARN = 10; // Aviso si el PDF supera N páginas

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
   CATEGORIES
══════════════════════════════════════════════════════ */
async function loadCategories() {
  const result = await getProcedures();
  const categories = new Set();
  if (result.ok) {
    result.data.forEach(p => { const c = (p.category || "").trim(); if (c) categories.add(c); });
  }
  const sorted = [...categories].sort((a, b) => a.localeCompare(b, "es"));
  categorySelect.innerHTML = "";
  const ph = document.createElement("option");
  ph.value = ""; ph.disabled = true; ph.selected = true;
  ph.textContent = "Selecciona una categoría…";
  categorySelect.appendChild(ph);
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
    newCatWrap.hidden = false; categoryNew.value = ""; categoryNew.focus();
  } else { newCatWrap.hidden = true; categoryNew.value = ""; }
});
cancelNewCat.addEventListener("click", () => {
  newCatWrap.hidden = true; categoryNew.value = "";
  categorySelect.options[0].selected = true;
});
function getCategory() {
  return categorySelect.value === NEW_VALUE ? categoryNew.value.trim() : categorySelect.value.trim();
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
   PROGRESS BAR
══════════════════════════════════════════════════════ */
function setProgress(pct, label) {
  if (pdfProgressFill) pdfProgressFill.style.width = `${pct}%`;
  if (pdfProgressText && label) pdfProgressText.textContent = label;
}

/* ══════════════════════════════════════════════════════
   PDF HELPERS
══════════════════════════════════════════════════════ */

function escHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/** Detecta negrita e italica del nombre de fuente PDF */
function parseFontStyle(fontName = "", fontFamily = "") {
  const s = (fontName + " " + fontFamily).toLowerCase();
  return {
    bold:   /bold|heavy|black|semibold|demibold/.test(s),
    italic: /italic|oblique|slanted/.test(s),
  };
}

/** Aplica <strong> y <em> */
function applyStyle(text, { bold, italic }) {
  if (!text) return "";
  let out = escHtml(text);
  if (italic) out = `<em>${out}</em>`;
  if (bold)   out = `<strong>${out}</strong>`;
  return out;
}

/**
 * Multiplica dos matrices de transformación 2D (formato PDF: [a,b,c,d,e,f]).
 */
function mulMatrix(a, b) {
  return [
    a[0]*b[0] + a[2]*b[1],
    a[1]*b[0] + a[3]*b[1],
    a[0]*b[2] + a[2]*b[3],
    a[1]*b[2] + a[3]*b[3],
    a[0]*b[4] + a[2]*b[5] + a[4],
    a[1]*b[4] + a[3]*b[5] + a[5],
  ];
}

/**
 * Recorre la lista de operadores de la página y devuelve un Map:
 * nombre_imagen → { y, x, w, h } en coordenadas PDF.
 * También devuelve la lista de operaciones de imagen en orden de aparición
 * (preservando el orden correcto en el documento).
 */
function getImagePositions(opList) {
  const OPS       = pdfjsLib.OPS;
  const positions = new Map(); // name → {x, y, w, h}
  const order     = [];        // [{name, y}] en orden de aparición

  const matrixStack = [];
  let ctm = [1, 0, 0, 1, 0, 0];

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn   = opList.fnArray[i];
    const args = opList.argsArray[i];

    if (fn === OPS.save) {
      matrixStack.push([...ctm]);
    } else if (fn === OPS.restore) {
      ctm = matrixStack.pop() ?? [1, 0, 0, 1, 0, 0];
    } else if (fn === OPS.transform) {
      ctm = mulMatrix(ctm, args);
    } else if (fn === OPS.setTransform) {
      ctm = [...args];
    } else if (
      fn === OPS.paintImageXObject ||
      fn === OPS.paintImageXObjectRepeat
    ) {
      const name = args[0];
      if (typeof name === "string" && !positions.has(name)) {
        const pos = { x: ctm[4], y: ctm[5], w: Math.abs(ctm[0]), h: Math.abs(ctm[3]) };
        positions.set(name, pos);
        order.push({ name, y: pos.y });
      }
    }
  }

  return { positions, order };
}

/**
 * Pide un objeto de página a PDF.js (promesa con timeout).
 */
function getPageObj(page, name, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    try {
      page.objs.get(name, data => { clearTimeout(timer); resolve(data); });
    } catch (e) { clearTimeout(timer); reject(e); }
  });
}

/**
 * Convierte los datos de imagen de PDF.js (kind 1/2/3) a Data URL JPEG.
 */
function imgDataToUrl(imgData) {
  try {
    const { width, height, data, kind } = imgData;
    if (!width || !height || !data) return null;

    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");

    const rgba = new Uint8ClampedArray(width * height * 4);

    if (kind === 3) {       // RGBA
      rgba.set(data);
    } else if (kind === 2) { // RGB
      for (let i = 0; i < width * height; i++) {
        rgba[i*4]   = data[i*3];
        rgba[i*4+1] = data[i*3+1];
        rgba[i*4+2] = data[i*3+2];
        rgba[i*4+3] = 255;
      }
    } else if (kind === 1) { // Grayscale
      for (let i = 0; i < width * height; i++) {
        rgba[i*4] = rgba[i*4+1] = rgba[i*4+2] = data[i];
        rgba[i*4+3] = 255;
      }
    } else { return null; }

    ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
    const url = canvas.toDataURL("image/jpeg", 0.88);
    canvas.width = 0; canvas.height = 0; // liberar memoria
    return url;
  } catch { return null; }
}

/* ══════════════════════════════════════════════════════
   EXTRACCIÓN PRINCIPAL POR PÁGINA
══════════════════════════════════════════════════════ */

/**
 * Extrae el contenido de una página: texto con formato + imágenes embebidas,
 * todo ordenado por posición vertical (Y) para respetar el orden original.
 *
 * Devuelve HTML para insertar en Quill.
 */
async function extractPageContent(page) {
  /* ── 1. Texto ── */
  const textContent = await page.getTextContent();
  const { items, styles } = textContent;

  /* ── 2. Lista de operadores + posiciones de imagen ── */
  const opList = await page.getOperatorList();
  const { positions: imgPositions, order: imgOrder } = getImagePositions(opList);

  /* ── 3. Calcular altura media de fuente (para detectar headings) ── */
  const fontHeights = items.filter(i => i.str.trim()).map(i => i.height);
  const avgFontH    = fontHeights.length
    ? fontHeights.reduce((a, b) => a + b, 0) / fontHeights.length
    : 12;

  /* ── 4. Agrupar items de texto en líneas por Y ── */
  const lineMap = new Map();
  items.forEach(item => {
    if (!item.str) return;
    // Redondear Y a 0.5 para agrupar items en la misma línea
    const y = Math.round(item.transform[5] * 2) / 2;
    if (!lineMap.has(y)) lineMap.set(y, []);
    lineMap.get(y).push(item);
  });

  /* ── 5. Construir lista unificada: {y, html} ── */
  const contentBlocks = []; // {y: number, html: string}

  /* 5a. Bloques de texto */
  for (const [y, lineItems] of lineMap) {
    const sorted = lineItems.sort((a, b) => a.transform[4] - b.transform[4]);
    const lineText = sorted.map(i => i.str).join("").trim();
    if (!lineText) continue;

    const maxH      = Math.max(...sorted.map(i => i.height));
    const isH2      = maxH > avgFontH * 2.0;
    const isH3      = maxH > avgFontH * 1.4 && !isH2;
    const isHeading = isH2 || isH3;

    /* Construir HTML del segmento con formato */
    let segHtml = "";
    for (const item of sorted) {
      if (!item.str) continue;
      const style = parseFontStyle(item.fontName, styles[item.fontName]?.fontFamily ?? "");
      segHtml += applyStyle(item.str, isHeading ? { bold: false, italic: false } : style);
    }
    segHtml = segHtml.trim();
    if (!segHtml) continue;

    /* Detectar listas */
    const bulletM = lineText.match(/^[-•*·]\s+(.+)/);
    const numM    = lineText.match(/^(\d+)[.)]\s+(.+)/);

    let html;
    if (isH2)         html = `<h2>${segHtml}</h2>`;
    else if (isH3)    html = `<h3>${segHtml}</h3>`;
    else if (bulletM) html = `<ul><li>${escHtml(bulletM[1])}</li></ul>`;
    else if (numM)    html = `<ol><li>${escHtml(numM[2])}</li></ol>`;
    else              html = `<p>${segHtml}</p>`;

    contentBlocks.push({ y, html });
  }

  /* 5b. Bloques de imagen (extraer datos de page.objs) */
  for (const { name, y } of imgOrder) {
    try {
      const imgData = await getPageObj(page, name);
      if (!imgData?.data || imgData.width <= 10 || imgData.height <= 10) continue;
      const url = imgDataToUrl(imgData);
      if (!url) continue;
      contentBlocks.push({
        y,
        html: `<p><img src="${url}" style="max-width:100%;display:block;margin:8px 0;border-radius:4px;" /></p>`,
      });
    } catch { /* imagen no disponible, omitir */ }
  }

  /* ── 6. Ordenar de arriba abajo (Y mayor = más arriba en PDF) ── */
  contentBlocks.sort((a, b) => b.y - a.y);

  /* ── 7. Ensamblar HTML y fusionar listas adyacentes ── */
  let html = contentBlocks.map(b => b.html).join("");
  html = html.replace(/<\/ul>\s*<ul>/g, "").replace(/<\/ol>\s*<ol>/g, "");
  return html;
}

/* ══════════════════════════════════════════════════════
   ORQUESTADOR DE IMPORTACIÓN
══════════════════════════════════════════════════════ */
async function handlePdfImport(file) {
  if (!file || file.type !== "application/pdf") {
    showSaveMessage("El archivo seleccionado no es un PDF válido.", true); return;
  }
  if (file.size > 50 * 1024 * 1024) {
    showSaveMessage("El PDF supera los 50 MB. Usa un PDF más pequeño.", true); return;
  }

  setPdfBusy(true);
  pdfProgress.hidden = false;
  setProgress(0, "Cargando PDF…");

  try {
    if (typeof pdfjsLib === "undefined") throw new Error("PDF.js no está disponible.");

    const arrayBuffer = await file.arrayBuffer();
    const pdf         = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages  = pdf.numPages;

    if (totalPages > PAGE_WARN) {
      const ok = confirm(
        `Este PDF tiene ${totalPages} páginas.\n\n` +
        `PDFs muy largos con imágenes pueden generar mucho contenido.\n` +
        `¿Continuar de todas formas?`
      );
      if (!ok) return;
    }

    let fullHtml = "";

    for (let n = 1; n <= totalPages; n++) {
      setProgress(
        Math.round(((n - 1) / totalPages) * 92),
        `Procesando página ${n} de ${totalPages}…`
      );
      const page    = await pdf.getPage(n);
      const pageHtml = await extractPageContent(page);

      if (pageHtml.trim()) {
        if (n > 1) fullHtml += `<p><br></p>`;
        fullHtml += pageHtml;
      }
    }

    setProgress(96, "Insertando en el editor…");

    if (!fullHtml.trim()) {
      showSaveMessage(
        "No se encontró contenido extraíble. El PDF puede ser de imágenes escaneadas sin OCR.", true
      );
      return;
    }

    if (isEditorEmpty()) {
      quill.clipboard.dangerouslyPasteHTML(fullHtml);
    } else {
      const current = quill.root.innerHTML;
      quill.clipboard.dangerouslyPasteHTML(
        current + `<p><br></p><hr><p><br></p>` + fullHtml
      );
    }

    /* Autocompletar título */
    if (titleInput && !titleInput.value.trim()) {
      const name = file.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " ");
      titleInput.value = name.charAt(0).toUpperCase() + name.slice(1);
      if (docNameDisplay) docNameDisplay.textContent = titleInput.value;
    }

    setProgress(100, "¡Listo!");
    showSaveMessage(
      `PDF importado con texto editable${fullHtml.includes("<img") ? " e imágenes" : ""} (${totalPages} página${totalPages !== 1 ? "s" : ""}).`,
      false
    );

  } catch (err) {
    console.error("Error al importar PDF:", err);
    showSaveMessage(`Error al importar el PDF: ${err.message}`, true);
  } finally {
    setPdfBusy(false);
    setTimeout(() => { pdfProgress.hidden = true; setProgress(0, ""); }, 2200);
    pdfInput.value = "";
  }
}

function setPdfBusy(busy) {
  if (!pdfBtnLabel) return;
  pdfBtnLabel.classList.toggle("pdf-import-btn--loading", busy);
  pdfBtnLabel.setAttribute("aria-disabled", String(busy));
}

/* ── File input & drag-and-drop ── */
pdfInput?.addEventListener("change", () => { if (pdfInput.files[0]) handlePdfImport(pdfInput.files[0]); });

const editorEl = document.getElementById("stepsEditor");
const prevent  = e => { e.preventDefault(); e.stopPropagation(); };
["dragenter","dragover"].forEach(ev => editorEl?.addEventListener(ev, e => {
  prevent(e);
  if (e.dataTransfer?.types?.includes("Files")) editorEl.classList.add("pdf-dragover");
}));
["dragleave","drop"].forEach(ev => editorEl?.addEventListener(ev, e => {
  prevent(e); editorEl.classList.remove("pdf-dragover");
}));
editorEl?.addEventListener("drop", e => {
  prevent(e); editorEl.classList.remove("pdf-dragover");
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

  if (!title)       { showSaveMessage("El título es obligatorio.", true); titleInput?.focus(); return; }
  if (!category)    {
    showSaveMessage(categorySelect.value === NEW_VALUE ? "Escribe el nombre de la nueva categoría." : "Selecciona una categoría.", true);
    categorySelect.value === NEW_VALUE ? categoryNew.focus() : categorySelect.focus(); return;
  }
  if (!description) { showSaveMessage("La descripción es obligatoria.", true); document.getElementById("description")?.focus(); return; }
  if (isEditorEmpty()) { showSaveMessage("Los pasos son obligatorios.", true); return; }

  if (saveProcedureBtn) { saveProcedureBtn.disabled = true; saveProcedureBtn.textContent = "Guardando…"; }

  const result = await createProcedure({ title, category, description, stepsHtml, documentUrl });

  if (!result.ok) {
    showSaveMessage(`Error al guardar: ${result.error}`, true);
    if (saveProcedureBtn) {
      saveProcedureBtn.disabled = false;
      saveProcedureBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
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