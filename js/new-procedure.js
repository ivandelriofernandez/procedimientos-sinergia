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

const RENDER_SCALE = 2.0;   // Resolución de renderizado (2x = ~144 DPI)
const IMG_MIN_PX   = 24;    // Ignorar imágenes más pequeñas que esto en px
const PAGE_WARN    = 10;

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
  const cats = new Set();
  if (result.ok) result.data.forEach(p => { const c = (p.category||"").trim(); if(c) cats.add(c); });
  const sorted = [...cats].sort((a,b) => a.localeCompare(b,"es"));
  categorySelect.innerHTML = "";
  const ph = document.createElement("option");
  ph.value=""; ph.disabled=true; ph.selected=true;
  ph.textContent="Selecciona una categoría…"; categorySelect.appendChild(ph);
  sorted.forEach(cat => { const o=document.createElement("option"); o.value=cat; o.textContent=cat; categorySelect.appendChild(o); });
  if (sorted.length) { const sep=document.createElement("option"); sep.disabled=true; sep.textContent="──────────────"; categorySelect.appendChild(sep); }
  const newOpt=document.createElement("option"); newOpt.value=NEW_VALUE; newOpt.textContent="+ Nueva categoría…"; categorySelect.appendChild(newOpt);
}
categorySelect.addEventListener("change", () => {
  if (categorySelect.value===NEW_VALUE) { newCatWrap.hidden=false; categoryNew.value=""; categoryNew.focus(); }
  else { newCatWrap.hidden=true; categoryNew.value=""; }
});
cancelNewCat.addEventListener("click", () => { newCatWrap.hidden=true; categoryNew.value=""; categorySelect.options[0].selected=true; });
function getCategory() { return categorySelect.value===NEW_VALUE ? categoryNew.value.trim() : categorySelect.value.trim(); }

/* ══════════════════════════════════════════════════════
   TITLE
══════════════════════════════════════════════════════ */
if (titleInput && docNameDisplay) {
  titleInput.addEventListener("input", () => { docNameDisplay.textContent = titleInput.value.trim() || "Nuevo procedimiento"; });
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
function isEditorEmpty() { return !quill.getText().trim() && !quill.root.querySelector("img"); }

/* ══════════════════════════════════════════════════════
   PROGRESS
══════════════════════════════════════════════════════ */
function setProgress(pct, label) {
  if (pdfProgressFill) pdfProgressFill.style.width = `${pct}%`;
  if (pdfProgressText && label) pdfProgressText.textContent = label;
}

/* ══════════════════════════════════════════════════════
   PDF HELPERS — TEXTO CON FORMATO
══════════════════════════════════════════════════════ */

function escHtml(s) {
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

/**
 * Detecta negrita e itálica del nombre de fuente PDF.
 * Maneja prefijos de subconjunto ("ABCDEF+Helvetica-Bold") que son habituales
 * en PDFs con fuentes embebidas.
 */
function parseFontStyle(rawFontName="", fontFamily="") {
  // Quitar el prefijo de subconjunto (6 mayúsculas + "+")
  const fontName = /^[A-Z]{6}\+/.test(rawFontName)
    ? rawFontName.slice(7)
    : rawFontName;

  const s = (fontName + " " + fontFamily).toLowerCase();

  const bold = /bold|heavy|black|semibold|demibold|demi\b/.test(s) ||
               /-bd\b/.test(s) || /,bd\b/.test(s);  // abreviatura "Bd"
  const italic = /italic|oblique|slanted/.test(s) ||
                 /-it\b/.test(s) || /,it\b/.test(s);

  return { bold, italic };
}

function applyStyle(text, { bold, italic }) {
  if (!text) return "";
  let out = escHtml(text);
  if (italic) out = `<em>${out}</em>`;
  if (bold)   out = `<strong>${out}</strong>`;
  return out;
}

/**
 * Transforma los items de texto en una lista de bloques {y, html}.
 * Agrupa por línea (coordenada Y), detecta headings por tamaño de fuente,
 * detecta listas y aplica negrita/cursiva.
 */
function buildTextBlocks(textContent) {
  const { items, styles } = textContent;
  if (!items.length) return [];

  // Altura media para detectar headings
  const validHeights = items.filter(i => i.str.trim()).map(i => i.height);
  const avgH = validHeights.length
    ? validHeights.reduce((a,b) => a+b, 0) / validHeights.length
    : 12;

  // Agrupar por Y (redondear a 0.5 pt)
  const lineMap = new Map();
  items.forEach(item => {
    if (item.str == null) return;
    const y = Math.round(item.transform[5] * 2) / 2;
    if (!lineMap.has(y)) lineMap.set(y, []);
    lineMap.get(y).push(item);
  });

  const blocks = [];
  for (const [y, lineItems] of lineMap) {
    const sorted   = lineItems.sort((a,b) => a.transform[4] - b.transform[4]);
    const lineText = sorted.map(i => i.str).join("").trim();
    if (!lineText) continue;

    const maxH    = Math.max(...sorted.map(i => i.height));
    const isH2    = maxH > avgH * 2.0;
    const isH3    = maxH > avgH * 1.35 && !isH2;

    // HTML del segmento con formato
    let segHtml = "";
    for (const item of sorted) {
      if (!item.str) continue;
      const style = parseFontStyle(item.fontName, styles[item.fontName]?.fontFamily ?? "");
      // No aplicar negrita/cursiva en headings (ya son visuales)
      segHtml += applyStyle(item.str, (isH2||isH3) ? {bold:false,italic:false} : style);
    }
    segHtml = segHtml.trim();
    if (!segHtml) continue;

    const bulletM = lineText.match(/^[-•*·]\s+(.+)/);
    const numM    = lineText.match(/^(\d+)[.)]\s+(.+)/);

    let html;
    if      (isH2)    html = `<h2>${segHtml}</h2>`;
    else if (isH3)    html = `<h3>${segHtml}</h3>`;
    else if (bulletM) html = `<ul><li>${escHtml(bulletM[1])}</li></ul>`;
    else if (numM)    html = `<ol><li>${escHtml(numM[2])}</li></ol>`;
    else              html = `<p>${segHtml}</p>`;

    blocks.push({ y, html });
  }
  return blocks;
}

/* ══════════════════════════════════════════════════════
   PDF HELPERS — POSICIONES DE IMAGEN
══════════════════════════════════════════════════════ */

/**
 * Multiplica dos matrices CTM en formato PDF [a,b,c,d,e,f].
 */
function mulMatrix(a, b) {
  return [
    a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
    a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
    a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5],
  ];
}

/**
 * Recorre la lista de operadores PDF rastreando la pila de transformación.
 * Devuelve, en orden de aparición, cada imagen con su posición y tamaño
 * en coordenadas de espacio de usuario PDF.
 */
function getImagePositions(opList) {
  const OPS = pdfjsLib.OPS;
  const matrixStack = [];
  let ctm = [1,0,0,1,0,0];
  const seen  = new Set();
  const order = []; // {name, x, y, w, h} — y es borde inferior (coords PDF)

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn   = opList.fnArray[i];
    const args = opList.argsArray[i];

    if      (fn === OPS.save)      { matrixStack.push([...ctm]); }
    else if (fn === OPS.restore)   { ctm = matrixStack.pop() ?? [1,0,0,1,0,0]; }
    else if (fn === OPS.transform) { ctm = mulMatrix(ctm, args); }
    else if (fn === OPS.setTransform) { ctm = [...args]; }
    else if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) {
      const name = args[0];
      if (typeof name === "string" && !seen.has(name)) {
        seen.add(name);
        order.push({
          name,
          x: ctm[4],
          y: ctm[5],                  // borde inferior en coords PDF (Y↑)
          w: Math.abs(ctm[0]),
          h: Math.abs(ctm[3]),
        });
      }
    }
  }
  return order;
}

/* ══════════════════════════════════════════════════════
   EXTRACCIÓN DE PÁGINA — renderizado + recorte
══════════════════════════════════════════════════════ */

/**
 * Extrae el contenido de una página:
 *  - Texto con formato (negrita, cursiva, headings, listas) → editable en Quill
 *  - Imágenes → recortadas del canvas renderizado → <img> en Quill
 *
 * Ambos tipos se ordenan por posición Y para mantener el orden original.
 */
async function extractPageContent(page) {
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const vw = Math.ceil(viewport.width);
  const vh = Math.ceil(viewport.height);

  /* 1. Renderizar página completa en un canvas */
  const pageCanvas = document.createElement("canvas");
  pageCanvas.width  = vw;
  pageCanvas.height = vh;
  const ctx = pageCanvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, vw, vh);
  await page.render({ canvasContext: ctx, viewport }).promise;

  /* 2. Extraer texto con formato */
  const textContent = await page.getTextContent();
  const textBlocks  = buildTextBlocks(textContent);

  /* 3. Obtener posiciones de imágenes desde la lista de operadores */
  const opList    = await page.getOperatorList();
  const imgInfos  = getImagePositions(opList);

  /* 4. Recortar cada imagen del canvas renderizado */
  const imageBlocks = [];
  for (const { y: pdfY, x: pdfX, w: pdfW, h: pdfH } of imgInfos) {
    // Convertir coordenadas PDF → canvas
    // PDF: origen abajo-izquierda, Y↑   Canvas: origen arriba-izquierda, Y↓
    const cX = Math.round(pdfX * RENDER_SCALE);
    const cY = Math.round(vh - (pdfY + pdfH) * RENDER_SCALE);  // borde superior en canvas
    const cW = Math.round(pdfW * RENDER_SCALE);
    const cH = Math.round(pdfH * RENDER_SCALE);

    if (cW < IMG_MIN_PX || cH < IMG_MIN_PX) continue;  // ignorar micro-imágenes
    if (cX < 0 || cY < 0 || cX + cW > vw || cY + cH > vh) continue; // fuera de límites

    const crop = document.createElement("canvas");
    crop.width  = cW;
    crop.height = cH;
    crop.getContext("2d").drawImage(pageCanvas, cX, cY, cW, cH, 0, 0, cW, cH);

    const dataUrl = crop.toDataURL("image/jpeg", 0.88);
    crop.width = 0; crop.height = 0; // liberar memoria

    // Usar pdfY + pdfH como Y de referencia (borde superior en coords PDF)
    imageBlocks.push({
      y: pdfY + pdfH,
      html: `<p><img src="${dataUrl}" style="max-width:100%;display:block;margin:8px 0;border-radius:3px;" /></p>`,
    });
  }

  /* Liberar canvas de la página */
  pageCanvas.width = 0; pageCanvas.height = 0;

  /* 5. Ordenar todos los bloques por Y desc (mayor Y = más arriba en el PDF) */
  const all = [...textBlocks, ...imageBlocks].sort((a, b) => b.y - a.y);

  /* 6. Ensamblar HTML y fusionar listas adyacentes */
  let html = all.map(b => b.html).join("");
  html = html.replace(/<\/ul>\s*<ul>/g, "").replace(/<\/ol>\s*<ol>/g, "");
  return html;
}

/* ══════════════════════════════════════════════════════
   IMPORTACIÓN PRINCIPAL
══════════════════════════════════════════════════════ */
async function handlePdfImport(file) {
  if (!file || file.type !== "application/pdf") {
    showSaveMessage("El archivo seleccionado no es un PDF válido.", true); return;
  }
  if (file.size > 50 * 1024 * 1024) {
    showSaveMessage("El PDF supera los 50 MB.", true); return;
  }

  setPdfBusy(true);
  pdfProgress.hidden = false;
  setProgress(0, "Cargando PDF…");

  try {
    if (typeof pdfjsLib === "undefined") throw new Error("PDF.js no disponible.");

    const pdf        = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const totalPages = pdf.numPages;

    if (totalPages > PAGE_WARN) {
      if (!confirm(`Este PDF tiene ${totalPages} páginas.\n¿Continuar con la importación?`)) return;
    }

    let fullHtml = "";

    for (let n = 1; n <= totalPages; n++) {
      setProgress(Math.round(((n-1)/totalPages)*90), `Procesando página ${n} de ${totalPages}…`);
      const page     = await pdf.getPage(n);
      const pageHtml = await extractPageContent(page);
      if (pageHtml.trim()) {
        if (n > 1 && fullHtml) fullHtml += `<p><br></p>`;
        fullHtml += pageHtml;
      }
    }

    setProgress(96, "Insertando en el editor…");

    if (!fullHtml.trim()) {
      showSaveMessage("No se pudo extraer contenido del PDF.", true); return;
    }

    if (isEditorEmpty()) {
      quill.clipboard.dangerouslyPasteHTML(fullHtml);
    } else {
      quill.clipboard.dangerouslyPasteHTML(quill.root.innerHTML + `<p><br></p><hr><p><br></p>` + fullHtml);
    }

    /* Autocompletar título */
    if (titleInput && !titleInput.value.trim()) {
      const name = file.name.replace(/\.pdf$/i,"").replace(/[-_]/g," ");
      titleInput.value = name.charAt(0).toUpperCase() + name.slice(1);
      if (docNameDisplay) docNameDisplay.textContent = titleInput.value;
    }

    setProgress(100, "¡Listo!");
    const hasImgs = fullHtml.includes("<img");
    showSaveMessage(
      `PDF importado con texto editable${hasImgs ? " e imágenes" : ""} (${totalPages} página${totalPages!==1?"s":""}).`,
      false
    );

  } catch (err) {
    console.error("PDF import error:", err);
    showSaveMessage(`Error al importar el PDF: ${err.message}`, true);
  } finally {
    setPdfBusy(false);
    setTimeout(() => { pdfProgress.hidden=true; setProgress(0,""); }, 2200);
    pdfInput.value = "";
  }
}

function setPdfBusy(busy) {
  if (!pdfBtnLabel) return;
  pdfBtnLabel.classList.toggle("pdf-import-btn--loading", busy);
  pdfBtnLabel.setAttribute("aria-disabled", String(busy));
}

/* ── Eventos de entrada ── */
pdfInput?.addEventListener("change", () => { if (pdfInput.files[0]) handlePdfImport(pdfInput.files[0]); });

const editorEl = document.getElementById("stepsEditor");
const prevent  = e => { e.preventDefault(); e.stopPropagation(); };
["dragenter","dragover"].forEach(ev => editorEl?.addEventListener(ev, e => {
  prevent(e);
  if (e.dataTransfer?.types?.includes("Files")) editorEl.classList.add("pdf-dragover");
}));
["dragleave","drop"].forEach(ev => editorEl?.addEventListener(ev, e => { prevent(e); editorEl.classList.remove("pdf-dragover"); }));
editorEl?.addEventListener("drop", e => {
  prevent(e); editorEl.classList.remove("pdf-dragover");
  const f = e.dataTransfer?.files?.[0];
  if (f?.type==="application/pdf") handlePdfImport(f);
});

/* ══════════════════════════════════════════════════════
   SAVE / AUTH
══════════════════════════════════════════════════════ */
function showSaveMessage(text, isError=false) {
  if (!saveMessage) return;
  saveMessage.textContent = text;
  saveMessage.className   = isError ? "word-save-message word-save-message--error" : "word-save-message word-save-message--ok";
  saveMessage.hidden = false;
  setTimeout(() => { saveMessage.hidden=true; }, 5000);
}

async function handleSave() {
  const title       = titleInput?.value.trim()||"";
  const category    = getCategory();
  const description = document.getElementById("description")?.value.trim()||"";
  const stepsHtml   = quill.root.innerHTML.trim();
  const documentUrl = document.getElementById("documentUrl")?.value.trim()||"";

  if (!title)       { showSaveMessage("El título es obligatorio.", true); titleInput?.focus(); return; }
  if (!category)    { showSaveMessage(categorySelect.value===NEW_VALUE?"Escribe el nombre de la nueva categoría.":"Selecciona una categoría.", true); (categorySelect.value===NEW_VALUE?categoryNew:categorySelect).focus(); return; }
  if (!description) { showSaveMessage("La descripción es obligatoria.", true); document.getElementById("description")?.focus(); return; }
  if (isEditorEmpty()) { showSaveMessage("Los pasos son obligatorios.", true); return; }

  if (saveProcedureBtn) { saveProcedureBtn.disabled=true; saveProcedureBtn.textContent="Guardando…"; }

  const result = await createProcedure({ title, category, description, stepsHtml, documentUrl });

  if (!result.ok) {
    showSaveMessage(`Error al guardar: ${result.error}`, true);
    if (saveProcedureBtn) {
      saveProcedureBtn.disabled=false;
      saveProcedureBtn.innerHTML=`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Guardar`;
    }
    return;
  }
  window.location.href="./app.html";
}

saveProcedureBtn?.addEventListener("click", handleSave);
logoutBtn?.addEventListener("click", async () => {
  const r = await logoutUser();
  if (!r.ok) { alert(`Error al cerrar sesión: ${r.error}`); return; }
  window.location.href="index.html";
});
watchAuthState((user) => {
  if (!user) { window.location.href="index.html"; return; }
  if (currentUserBox) currentUserBox.textContent = user.email;
  loadCategories();
});