// ui.js — Reusable UI helpers: modals, toasts, PIN pad, etc.

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
export function showToast(msg, type = "") {
  const el = document.getElementById("toast");
  clearTimeout(toastTimer);
  el.textContent     = msg;
  el.className       = `toast ${type} show`;
  toastTimer = setTimeout(() => { el.className = "toast"; }, 3000);
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export function openModal(title, bodyHTML, footerHTML = "") {
  document.getElementById("modal-title").textContent  = title;
  document.getElementById("modal-body").innerHTML     = bodyHTML;
  document.getElementById("modal-footer").innerHTML   = footerHTML;
  document.getElementById("modal-overlay").classList.add("active");
}

export function closeModal() {
  document.getElementById("modal-overlay").classList.remove("active");
}

// ── PIN Pad Builder ────────────────────────────────────────────────────────────
export function buildPinPad(padEl, displayEl, onComplete, maxLen = 6) {
  let val = "";

  function refresh() {
    const dots = displayEl.querySelectorAll(".pin-dot");
    dots.forEach((d, i) => d.classList.toggle("filled", i < val.length));
  }

  padEl.innerHTML = "";

  const nums = ["1","2","3","4","5","6","7","8","9","","0","⌫"];
  nums.forEach(n => {
    const btn = document.createElement("button");
    btn.className = "pin-btn" + (n === "⌫" ? " del" : "");
    btn.textContent = n;
    if (n === "") { btn.style.visibility = "hidden"; padEl.appendChild(btn); return; }
    btn.addEventListener("click", () => {
      if (n === "⌫") { val = val.slice(0, -1); refresh(); return; }
      if (val.length >= maxLen) return;
      val += n;
      refresh();
      if (val.length >= 4) {
        // auto-submit after a tiny delay so user sees the last dot fill
        setTimeout(() => { onComplete(val); val = ""; refresh(); }, 150);
      }
    });
    padEl.appendChild(btn);
  });

  refresh();
  return { reset() { val = ""; refresh(); } };
}

// ── Confirm Dialog ────────────────────────────────────────────────────────────
export function confirmDialog(msg) {
  return new Promise(resolve => {
    openModal(
      "Confirm",
      `<p style="color:var(--text-secondary);line-height:1.6;">${msg}</p>`,
      `<button class="btn-ghost" id="conf-no">Cancel</button>
       <button class="btn-primary" id="conf-yes" style="background:var(--accent-red)">Confirm</button>`
    );
    document.getElementById("conf-yes").onclick = () => { closeModal(); resolve(true); };
    document.getElementById("conf-no").onclick  = () => { closeModal(); resolve(false); };
  });
}

// ── Trip Type Config ──────────────────────────────────────────────────────────
export const TRIP_TYPES = [
  { id: "day",       label: "Day Trip",    icon: "🌅" },
  { id: "weekend",   label: "Weekend",     icon: "🏕️" },
  { id: "road",      label: "Road Trip",   icon: "🚗" },
  { id: "vacation",  label: "Vacation",    icon: "🏖️" },
  { id: "business",  label: "Business",    icon: "💼" },
  { id: "adventure", label: "Adventure",   icon: "🏔️" },
  { id: "cruise",    label: "Cruise",      icon: "🚢" },
  { id: "other",     label: "Other",       icon: "✈️" },
];

export function tripIcon(type) {
  return TRIP_TYPES.find(t => t.id === type)?.icon || "✈️";
}
export function tripLabel(type) {
  return TRIP_TYPES.find(t => t.id === type)?.label || "Trip";
}

// ── Date Helpers ──────────────────────────────────────────────────────────────
export function formatDate(d) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function daysBetween(start, end) {
  if (!start || !end) return null;
  const ms = new Date(end) - new Date(start);
  return Math.round(ms / 86400000) + 1;
}

// ── Event Category Style ──────────────────────────────────────────────────────
const CAT_MAP = {
  transport: "cat-transport",
  food:      "cat-food",
  activity:  "cat-activity",
  lodging:   "cat-lodging",
  other:     "cat-other"
};
export function catClass(cat) { return CAT_MAP[cat] || "cat-other"; }

export const CAT_ICONS = {
  transport: "🚗",
  food:      "🍽️",
  activity:  "🎯",
  lodging:   "🏨",
  other:     "📌"
};

// ── Expense Category Icons ────────────────────────────────────────────────────
export const EXPENSE_ICONS = {
  transport: "✈️",
  lodging:   "🏨",
  food:      "🍔",
  activity:  "🎡",
  shopping:  "🛍️",
  other:     "💸"
};
