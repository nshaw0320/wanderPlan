// auth.js — PIN authentication helpers
import { getMeta, setMeta } from "./db.js";

// ── Hashing ───────────────────────────────────────────────────────────────────
export async function hashPin(pin) {
  const buf    = new TextEncoder().encode(pin + "wanderplan-salt");
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── Check if first run ────────────────────────────────────────────────────────
export async function isFirstRun() {
  const meta = await getMeta();
  return !meta || !meta.pinHash;
}

// ── Setup PIN ─────────────────────────────────────────────────────────────────
export async function setupPin(pin) {
  const pinHash = await hashPin(pin);
  await setMeta({ pinHash });
}

// ── Verify PIN ────────────────────────────────────────────────────────────────
export async function verifyPin(pin) {
  const meta = await getMeta();
  if (!meta || !meta.pinHash) return false;
  const attempt = await hashPin(pin);
  return attempt === meta.pinHash;
}

// ── Change PIN ────────────────────────────────────────────────────────────────
export async function changePin(newPin) {
  const pinHash = await hashPin(newPin);
  await setMeta({ pinHash });
}

// ── Session state ─────────────────────────────────────────────────────────────
let _unlocked = false;

export function setUnlocked(v) { _unlocked = v; }
export function isUnlocked()   { return _unlocked; }
