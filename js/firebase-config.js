import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA_vLE-wfCtkLerYQilie4T_9b0BOa2j0Q",
  authDomain: "procedimientos-sinergia.firebaseapp.com",
  projectId: "procedimientos-sinergia",
  storageBucket: "procedimientos-sinergia.firebasestorage.app",
  messagingSenderId: "1009124578923",
  appId: "1:1009124578923:web:7f96e3c38f4a37c60a832e"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);