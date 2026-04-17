export function setMessage(element, message, type = 'info') {
  if (!element) return;
  element.textContent = message;
  element.classList.remove('status-error', 'status-ok');
  if (type === 'error') element.classList.add('status-error');
  if (type === 'ok') element.classList.add('status-ok');
}

export function formatDate(value) {
  if (!value) return '-';
  const date = value?.toDate ? value.toDate() : new Date(value);
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
}

export function sanitizeText(text = '') {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
