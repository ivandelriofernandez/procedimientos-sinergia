import { loginWithEmail, loginWithGoogle, watchAuth } from './auth.js';
import { setMessage } from './ui.js';

const loginForm = document.getElementById('loginForm');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const authMessage = document.getElementById('authMessage');

watchAuth((user) => {
  if (user) window.location.href = './app.html';
});

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();

  try {
    await loginWithEmail(email, password);
    setMessage(authMessage, 'Acceso correcto. Redirigiendo...', 'ok');
  } catch (error) {
    setMessage(authMessage, mapAuthError(error), 'error');
  }
});

googleLoginBtn?.addEventListener('click', async () => {
  try {
    await loginWithGoogle();
    setMessage(authMessage, 'Acceso con Google correcto.', 'ok');
  } catch (error) {
    setMessage(authMessage, mapAuthError(error), 'error');
  }
});

function mapAuthError(error) {
  const map = {
    'auth/invalid-credential': 'Credenciales inválidas.',
    'auth/invalid-email': 'El email no es válido.',
    'auth/popup-closed-by-user': 'Se cerró la ventana de Google antes de completar el acceso.',
    'auth/unauthorized-domain': 'Añade tu dominio de Vercel a Authorized Domains en Firebase Auth.'
  };
  return map[error.code] || `Error de autenticación: ${error.message}`;
}
