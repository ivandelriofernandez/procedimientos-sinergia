import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { auth } from "./firebase-config.js";

export async function loginUser(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { ok: true, user: userCredential.user };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export async function registerUser(email, password) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return { ok: true, user: userCredential.user };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export async function logoutUser() {
  try {
    await signOut(auth);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export function watchAuthState(callback) {
  onAuthStateChanged(auth, callback);
}