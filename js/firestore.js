import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { db } from "./firebase-config.js";

const proceduresCollection = collection(db, "procedures");

export async function createProcedure(data) {
  try {
    const payload = {
      title: data.title || "",
      category: data.category || "",
      description: data.description || "",
      steps: data.steps || "",
      documentUrl: data.documentUrl || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const docRef = await addDoc(proceduresCollection, payload);
    return { ok: true, id: docRef.id };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export async function getProcedures() {
  try {
    const q = query(proceduresCollection, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    const items = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));

    return { ok: true, data: items };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export async function getProcedureById(id) {
  try {
    const ref = doc(db, "procedures", id);
    const snapshot = await getDoc(ref);

    if (!snapshot.exists()) {
      return { ok: false, error: "El procedimiento no existe" };
    }

    return {
      ok: true,
      data: {
        id: snapshot.id,
        ...snapshot.data()
      }
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export async function updateProcedure(id, data) {
  try {
    const ref = doc(db, "procedures", id);

    await updateDoc(ref, {
      title: data.title || "",
      category: data.category || "",
      description: data.description || "",
      steps: data.steps || "",
      documentUrl: data.documentUrl || "",
      updatedAt: serverTimestamp()
    });

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export async function deleteProcedure(id) {
  try {
    const ref = doc(db, "procedures", id);
    await deleteDoc(ref);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}