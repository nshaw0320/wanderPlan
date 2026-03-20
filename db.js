// db.js — Firestore data access layer
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, addDoc, serverTimestamp, orderBy, query
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// ── Init ──────────────────────────────────────────────────────────────────────
const app = initializeApp(firebaseConfig);
export const db  = getFirestore(app);

// ── Document Paths ────────────────────────────────────────────────────────────
// All data lives under a single "wanderplan" document tree so we don't need
// auth — the PIN acts as the access gate.
const ROOT     = "wanderplan";
const META_DOC = "meta";  // { pinHash, apiKey }

function tripsCol()       { return collection(db, ROOT, META_DOC, "trips"); }
function tripDoc(id)      { return doc(db, ROOT, META_DOC, "trips", id); }
function subCol(tid, sub) { return collection(db, ROOT, META_DOC, "trips", tid, sub); }
function subDoc(tid, sub, sid) { return doc(db, ROOT, META_DOC, "trips", tid, sub, sid); }

// ── Meta (PIN + API Key) ──────────────────────────────────────────────────────
export async function getMeta() {
  const snap = await getDoc(doc(db, ROOT, META_DOC));
  return snap.exists() ? snap.data() : null;
}

export async function setMeta(data) {
  await setDoc(doc(db, ROOT, META_DOC), data, { merge: true });
}

// ── Trips ─────────────────────────────────────────────────────────────────────
export async function getAllTrips() {
  const q    = query(tripsCol(), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getTrip(id) {
  const snap = await getDoc(tripDoc(id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createTrip(data) {
  const ref = await addDoc(tripsCol(), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function updateTrip(id, data) {
  await updateDoc(tripDoc(id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteTrip(id) {
  // Delete all subcollections first
  for (const sub of ["days", "packing", "expenses", "notes"]) {
    const snap = await getDocs(subCol(id, sub));
    for (const d of snap.docs) await deleteDoc(d.ref);
  }
  await deleteDoc(tripDoc(id));
}

// ── Days / Itinerary ──────────────────────────────────────────────────────────
export async function getDays(tripId) {
  const q    = query(subCol(tripId, "days"), orderBy("dayIndex", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addDay(tripId, data) {
  const ref = await addDoc(subCol(tripId, "days"), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateDay(tripId, dayId, data) {
  await updateDoc(subDoc(tripId, "days", dayId), data);
}

export async function deleteDay(tripId, dayId) {
  await deleteDoc(subDoc(tripId, "days", dayId));
}

// ── Packing Items ─────────────────────────────────────────────────────────────
export async function getPackingItems(tripId) {
  const q    = query(subCol(tripId, "packing"), orderBy("createdAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addPackingItem(tripId, data) {
  const ref = await addDoc(subCol(tripId, "packing"), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updatePackingItem(tripId, itemId, data) {
  await updateDoc(subDoc(tripId, "packing", itemId), data);
}

export async function deletePackingItem(tripId, itemId) {
  await deleteDoc(subDoc(tripId, "packing", itemId));
}

// ── Expenses ──────────────────────────────────────────────────────────────────
export async function getExpenses(tripId) {
  const q    = query(subCol(tripId, "expenses"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addExpense(tripId, data) {
  const ref = await addDoc(subCol(tripId, "expenses"), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function deleteExpense(tripId, expId) {
  await deleteDoc(subDoc(tripId, "expenses", expId));
}

// ── Notes ─────────────────────────────────────────────────────────────────────
export async function getNotes(tripId) {
  const q    = query(subCol(tripId, "notes"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addNote(tripId, data) {
  const ref = await addDoc(subCol(tripId, "notes"), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateNote(tripId, noteId, data) {
  await updateDoc(subDoc(tripId, "notes", noteId), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteNote(tripId, noteId) {
  await deleteDoc(subDoc(tripId, "notes", noteId));
}

// ── Delete ALL data ───────────────────────────────────────────────────────────
export async function deleteAllData() {
  const trips = await getAllTrips();
  for (const t of trips) await deleteTrip(t.id);
  await deleteDoc(doc(db, ROOT, META_DOC));
}
