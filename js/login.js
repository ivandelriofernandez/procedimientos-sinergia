import { loginUser, watchAuthState } from "./auth.js";

const loginForm    = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");

function showMessage(text, isError = false) {
  if (!loginMessage) return;
  loginMessage.textContent = text;
  loginMessage.className = isError ? "message error" : "message success";
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const btn = loginForm.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Entrando…";

    const email    = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value.trim();
    const result   = await loginUser(email, password);

    if (!result.ok) {
      showMessage("Email o contraseña incorrectos.", true);
      btn.disabled = false;
      btn.textContent = "Entrar";
      return;
    }

    window.location.href = "app.html";
  });
}

watchAuthState((user) => {
  if (user) window.location.href = "app.html";
});