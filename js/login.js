import { loginUser, registerUser, watchAuthState } from "./auth.js";

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const loginMessage = document.getElementById("loginMessage");

function showMessage(text, isError = false) {
  loginMessage.textContent = text;
  loginMessage.className = isError ? "message error" : "message success";
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value.trim();

    const result = await loginUser(email, password);

    if (!result.ok) {
      showMessage(result.error, true);
      return;
    }

    showMessage("Login correcto");
    window.location.href = "app.html";
  });
}

if (registerForm) {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("registerEmail").value.trim();
    const password = document.getElementById("registerPassword").value.trim();

    const result = await registerUser(email, password);

    if (!result.ok) {
      showMessage(result.error, true);
      return;
    }

    showMessage("Usuario creado correctamente");
    window.location.href = "app.html";
  });
}

watchAuthState((user) => {
  if (user && window.location.pathname.endsWith("index.html")) {
    window.location.href = "app.html";
  }
});