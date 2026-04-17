/**
 * image-resizer.js
 * Attach to any Quill 2 instance to enable click-to-select + drag-to-resize on images.
 * Returns { hide } so callers can programmatically dismiss the resize UI.
 */
export function initImageResizer(quill) {
  const root = quill.root;
  let img      = null;
  let box      = null;
  let dragDir  = null;
  let startX, startY, startW, startH;

  /* ── Position the floating box over the selected image ── */
  function positionBox() {
    if (!img || !box) return;
    const r = img.getBoundingClientRect();
    box.style.left   = `${r.left}px`;
    box.style.top    = `${r.top}px`;
    box.style.width  = `${r.width}px`;
    box.style.height = `${r.height}px`;
    if (box._lbl) updateLabel(box._lbl);
  }

  /* ── Update the size label shown above the box ── */
  function updateLabel(lbl) {
    if (!lbl || !img) return;
    const nat = img.naturalWidth;
    const cur = Math.round(img.getBoundingClientRect().width);
    const h   = Math.round(img.getBoundingClientRect().height);
    lbl.textContent = nat
      ? `${cur} × ${h}px  (original ${nat}px)`
      : `${cur} × ${h}px`;
  }

  /* ── Show the resize box around an image ── */
  function showBox(target) {
    hideBox();
    img = target;
    img.classList.add('ir-selected');

    box = document.createElement('div');
    box.className = 'ir-box';

    ['nw','n','ne','e','se','s','sw','w'].forEach(d => {
      const h = document.createElement('span');
      h.className = `ir-handle ir-${d}`;
      h.addEventListener('mousedown', e => startDrag(e, d));
      box.appendChild(h);
    });

    /* Size label */
    const lbl = document.createElement('span');
    lbl.className = 'ir-label';
    box.appendChild(lbl);
    box._lbl = lbl;

    document.body.appendChild(box);
    positionBox();

    window.addEventListener('scroll', positionBox, true);
    window.addEventListener('resize', positionBox);
  }

  /* ── Remove the resize box ── */
  function hideBox() {
    if (img)  { img.classList.remove('ir-selected'); img = null; }
    if (box)  { box.remove(); box = null; }
    window.removeEventListener('scroll', positionBox, true);
    window.removeEventListener('resize', positionBox);
  }

  /* ── Drag start ── */
  function startDrag(e, dir) {
    e.preventDefault();
    e.stopPropagation();
    dragDir = dir;
    startX  = e.clientX;
    startY  = e.clientY;
    startW  = img.offsetWidth;
    startH  = img.offsetHeight;
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup',   stopDrag);
  }

  /* ── Drag move ── */
  function onDrag(e) {
    if (!img || !dragDir) return;
    const dx     = e.clientX - startX;
    const dy     = e.clientY - startY;
    const aspect = startW / (startH || 1);
    let newW     = startW;

    if      (dragDir.includes('e')) newW = startW + dx;
    else if (dragDir.includes('w')) newW = startW - dx;
    else if (dragDir === 's')       newW = (startH + dy) * aspect;
    else if (dragDir === 'n')       newW = (startH - dy) * aspect;

    newW = Math.max(60, Math.round(newW));
    img.style.width  = `${newW}px`;
    img.style.height = 'auto';
    positionBox();
  }

  /* ── Drag end ── */
  function stopDrag() {
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup',   stopDrag);
    dragDir = null;
  }

  /* ── Click inside editor ── */
  root.addEventListener('click', e => {
    if (e.target.tagName === 'IMG') {
      showBox(e.target);
    } else if (!box?.contains(e.target)) {
      hideBox();
    }
  });

  /* ── Click outside editor ── */
  document.addEventListener('mousedown', e => {
    if (box && !box.contains(e.target) && !root.contains(e.target)) {
      hideBox();
    }
  });

  return { hide: hideBox };
}