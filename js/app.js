import { logoutUser, watchAuthState } from "./auth.js";
import { getProcedures } from "./firestore.js";

const proceduresList = document.getElementById("proceduresList");
const logoutBtn = document.getElementById("logoutBtn");
const currentUserBox = document.getElementById("currentUser");

function escapeHtml(text) {
  if (!text) return "";
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

  loadProcedures();
});