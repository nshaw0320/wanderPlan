// app.js — Main WanderPlan application
import { getMeta, setMeta, deleteAllData,
         getAllTrips, getTrip, createTrip, updateTrip, deleteTrip,
         getDays, addDay, updateDay, deleteDay,
         getPackingItems, addPackingItem, updatePackingItem, deletePackingItem,
         getExpenses, addExpense, deleteExpense,
         getNotes, addNote, updateNote, deleteNote } from "./db.js";
import { isFirstRun, setupPin, verifyPin, changePin, setUnlocked, isUnlocked } from "./auth.js";
import { generateTripSummary, generatePackingList, suggestDayItinerary } from "./ai.js";
import { showToast, openModal, closeModal, confirmDialog,
         buildPinPad, TRIP_TYPES, tripIcon, tripLabel,
         formatDate, daysBetween, catClass, CAT_ICONS, EXPENSE_ICONS } from "./ui.js";

// ── State ─────────────────────────────────────────────────────────────────────
let state = {
  trips:        [],
  activeTrip:   null,
  days:         [],
  packingItems: [],
  expenses:     [],
  notes:        []
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ============================================================
// INIT
// ============================================================
async function init() {
  setupModalClose();
  setupSettingsPanel();

  try {
    const firstRun = await isFirstRun();
    if (firstRun) {
      showAuthSetup();
    } else {
      showAuthLogin();
    }
  } catch (e) {
    console.error("Firebase init error:", e);
    showError("Could not connect to database. Check your Firebase config.");
  }
}

function showError(msg) {
  document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:1rem;font-family:sans-serif;color:#f0f2f8;background:#0f1117;padding:2rem;text-align:center;">
    <div style="font-size:2rem;">⚠️</div>
    <div style="color:#f87171;max-width:400px;">${msg}</div>
    <div style="color:#4a5568;font-size:0.8rem;">Check js/firebase-config.js and make sure your Firebase project is configured.</div>
  </div>`;
}

// ============================================================
// AUTH — PIN Setup
// ============================================================
function showAuthSetup() {
  $("auth-setup").style.display = "block";
  $("auth-login").style.display = "none";

  let firstPin = null;
  const setupPad  = buildPinPad($("setup-pin-pad"), $("setup-pin-display"), async (pin) => {
    if (!firstPin) {
      // First entry
      firstPin = pin;
      $("setup-confirm").style.display = "block";
      $("setup-pin-pad").style.display = "none";
    }
  });

  let confirmPad;
  setTimeout(() => {
    // Build confirm pad lazily
    confirmPad = buildPinPad($("setup-pin-pad"), $("confirm-pin-display"), async (pin) => {
      if (pin !== firstPin) {
        $("auth-error").textContent = "PINs don't match. Try again.";
        firstPin = null;
        $("setup-confirm").style.display = "none";
        $("setup-pin-pad").style.display = "block";
        setupPad.reset();
        confirmPad && confirmPad.reset();
        return;
      }
      try {
        await setupPin(pin);
        setUnlocked(true);
        bootApp();
      } catch (e) {
        $("auth-error").textContent = "Setup failed: " + e.message;
      }
    });
  }, 0);

  // Swap pad after first entry
  const origOnComplete = (pin) => {
    if (!firstPin) {
      firstPin = pin;
      $("setup-confirm").style.display = "block";
      $("setup-pin-pad").innerHTML = "";
      buildPinPad($("setup-pin-pad"), $("confirm-pin-display"), async (confirmPin) => {
        if (confirmPin !== firstPin) {
          $("auth-error").textContent = "PINs don't match. Try again.";
          firstPin = null;
          $("setup-confirm").style.display = "none";
          $("setup-pin-pad").innerHTML = "";
          showAuthSetup();
          return;
        }
        try {
          await setupPin(confirmPin);
          setUnlocked(true);
          bootApp();
        } catch (e) {
          $("auth-error").textContent = "Setup failed: " + e.message;
        }
      });
    }
  };
  // rebuild correctly
  $("setup-pin-pad").innerHTML = "";
  buildPinPad($("setup-pin-pad"), $("setup-pin-display"), origOnComplete);
}

// ── AUTH — Login ──────────────────────────────────────────────────────────────
function showAuthLogin() {
  $("auth-setup").style.display = "none";
  $("auth-login").style.display = "block";

  buildPinPad($("login-pin-pad"), $("login-pin-display"), async (pin) => {
    const ok = await verifyPin(pin);
    if (ok) {
      setUnlocked(true);
      bootApp();
    } else {
      $("login-error").textContent = "Incorrect PIN. Try again.";
      setTimeout(() => { $("login-error").textContent = ""; }, 2000);
    }
  });

  $("reset-pin-btn").onclick = async () => {
    const ok = await confirmDialog("This will delete ALL your trip data and reset the app. Are you sure?");
    if (ok) {
      await deleteAllData();
      showAuthSetup();
    }
  };
}

// ============================================================
// BOOT APP
// ============================================================
async function bootApp() {
  $("auth-screen").classList.remove("active");
  $("app-screen").classList.add("active");

  setupNav();
  await loadTrips();
  showDashboard();
}

// ============================================================
// NAV & SIDEBAR
// ============================================================
function setupNav() {
  $("menu-btn").onclick = openSidebar;
  $("sidebar-close").onclick = closeSidebar;
  $("sidebar-overlay").onclick = closeSidebar;

  $("new-trip-btn").onclick = () => { closeSidebar(); openNewTripModal(); };
  $("dashboard-new-trip-btn").onclick = openNewTripModal;

  $("lock-btn").onclick = () => {
    setUnlocked(false);
    $("app-screen").classList.remove("active");
    $("auth-screen").classList.add("active");
    showAuthLogin();
  };

  $("settings-btn").onclick = () => { closeSidebar(); openSettings(); };
  $("settings-close").onclick = closeSettings;
  $("save-api-key-btn").onclick = saveApiKey;
  $("change-pin-btn").onclick = openChangePinModal;
  $("delete-all-btn").onclick = async () => {
    const ok = await confirmDialog("Delete ALL trips and data? This cannot be undone.");
    if (!ok) return;
    await deleteAllData();
    state.trips = [];
    state.activeTrip = null;
    closeSettings();
    showDashboard();
    renderSidebar();
    showToast("All data deleted", "error");
  };

  $("modal-close").onclick = closeModal;

  // AI assist button
  $("ai-assist-btn").onclick = () => {
    if (!state.activeTrip) { showToast("Open a trip first to use AI features.", ""); return; }
    showToast("Use ✨ buttons within the trip tabs for AI features.", "");
  };

  // Tab switching
  document.querySelectorAll(".trip-tab").forEach(tab => {
    tab.onclick = () => switchTab(tab.dataset.tab);
  });

  // Trip action buttons
  $("edit-trip-btn").onclick   = () => openEditTripModal(state.activeTrip);
  $("delete-trip-btn").onclick = async () => {
    const ok = await confirmDialog(`Delete "${state.activeTrip.name}"? This cannot be undone.`);
    if (!ok) return;
    await deleteTrip(state.activeTrip.id);
    state.activeTrip = null;
    await loadTrips();
    showDashboard();
    showToast("Trip deleted");
  };

  $("add-day-btn").onclick     = openAddDayModal;
  $("add-packing-btn").onclick = openAddPackingModal;
  $("ai-packing-btn").onclick  = runAiPacking;
  $("add-expense-btn").onclick = openAddExpenseModal;
  $("add-note-btn").onclick    = openAddNoteModal;
  $("generate-summary-btn").onclick = runAiSummary;
}

function openSidebar() {
  $("sidebar").classList.add("open");
  $("sidebar-overlay").classList.add("active");
}
function closeSidebar() {
  $("sidebar").classList.remove("open");
  $("sidebar-overlay").classList.remove("active");
}

// ============================================================
// TRIPS — Load & Render
// ============================================================
async function loadTrips() {
  state.trips = await getAllTrips();
  renderSidebar();
  renderDashboard();
}

function renderSidebar() {
  const list = $("trips-list");
  if (!state.trips.length) {
    list.innerHTML = `<div class="trips-empty">No trips yet. Create your first!</div>`;
    return;
  }
  list.innerHTML = state.trips.map(t => `
    <div class="trip-item ${state.activeTrip?.id === t.id ? "active" : ""}" data-id="${t.id}">
      <span class="trip-item-icon">${tripIcon(t.type)}</span>
      <div class="trip-item-info">
        <div class="trip-item-name">${esc(t.name)}</div>
        <div class="trip-item-meta">${tripLabel(t.type)} ${t.startDate ? "· " + formatDate(t.startDate) : ""}</div>
      </div>
    </div>
  `).join("");

  list.querySelectorAll(".trip-item").forEach(el => {
    el.onclick = () => {
      closeSidebar();
      openTrip(el.dataset.id);
    };
  });
}

function renderDashboard() {
  // Stats
  const total     = state.trips.length;
  const upcoming  = state.trips.filter(t => t.startDate && new Date(t.startDate) >= new Date()).length;
  const planned   = state.trips.filter(t => t.status === "planning").length;

  $("dashboard-stats").innerHTML = `
    <div class="stat-card"><div class="stat-card-value">${total}</div><div class="stat-card-label">Total Trips</div></div>
    <div class="stat-card"><div class="stat-card-value">${upcoming}</div><div class="stat-card-label">Upcoming</div></div>
    <div class="stat-card"><div class="stat-card-value">${planned}</div><div class="stat-card-label">In Planning</div></div>
  `;

  // Recent grid
  const recent = state.trips.slice(0, 6);
  if (!recent.length) {
    $("recent-trips-grid").innerHTML = `<div class="trips-grid-empty">Create a trip to get started ✈️</div>`;
    return;
  }
  $("recent-trips-grid").innerHTML = recent.map(t => `
    <div class="trip-card" data-id="${t.id}">
      <div class="trip-card-type">${tripLabel(t.type)}</div>
      <div class="trip-card-icon">${tripIcon(t.type)}</div>
      <div class="trip-card-name">${esc(t.name)}</div>
      <div class="trip-card-meta">
        ${t.destinations ? esc(t.destinations) + " · " : ""}
        ${t.startDate ? formatDate(t.startDate) : "No dates set"}
      </div>
    </div>
  `).join("");

  $("recent-trips-grid").querySelectorAll(".trip-card").forEach(el => {
    el.onclick = () => openTrip(el.dataset.id);
  });
}

// ============================================================
// DASHBOARD / TRIP VIEW
// ============================================================
function showDashboard() {
  $("dashboard-view").classList.add("active");
  $("trip-view").classList.remove("active");
  $("topbar-title").textContent = "WanderPlan";
  state.activeTrip = null;
  renderSidebar();
}

async function openTrip(id) {
  const trip = await getTrip(id);
  if (!trip) { showToast("Trip not found", "error"); return; }
  state.activeTrip = trip;

  renderSidebar();
  $("dashboard-view").classList.remove("active");
  $("trip-view").classList.add("active");
  $("topbar-title").textContent = trip.name;

  renderTripHeader(trip);
  switchTab("overview");
  renderOverview(trip);
}

function renderTripHeader(trip) {
  $("trip-type-badge").textContent    = tripLabel(trip.type);
  $("trip-title-display").textContent = trip.name;
  const dur = daysBetween(trip.startDate, trip.endDate);
  $("trip-meta").textContent = [
    trip.destinations,
    trip.startDate ? formatDate(trip.startDate) + (trip.endDate ? " – " + formatDate(trip.endDate) : "") : null,
    dur ? `${dur} day${dur > 1 ? "s" : ""}` : null
  ].filter(Boolean).join("  ·  ");
}

function switchTab(tabId) {
  document.querySelectorAll(".trip-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tabId));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.toggle("active", c.id === "tab-" + tabId));

  const trip = state.activeTrip;
  if (!trip) return;
  if (tabId === "overview")   renderOverview(trip);
  if (tabId === "itinerary")  loadAndRenderItinerary(trip);
  if (tabId === "packing")    loadAndRenderPacking(trip);
  if (tabId === "budget")     loadAndRenderBudget(trip);
  if (tabId === "notes")      loadAndRenderNotes(trip);
}

// ============================================================
// OVERVIEW TAB
// ============================================================
function renderOverview(trip) {
  const dur = daysBetween(trip.startDate, trip.endDate);
  $("ov-destinations").textContent = trip.destinations || "—";
  $("ov-dates").textContent = trip.startDate
    ? formatDate(trip.startDate) + (trip.endDate ? " – " + formatDate(trip.endDate) : "")
    : "—";
  $("ov-duration").textContent = dur ? `${dur} day${dur > 1 ? "s" : ""}` : "—";
  $("ov-travelers").textContent = trip.travelers || "—";
  $("ov-budget").textContent    = trip.budget ? `$${Number(trip.budget).toLocaleString()}` : "—";
  $("ov-status").textContent    = trip.status || "Planning";
  $("ov-description").textContent = trip.description || "No description added.";
  $("ai-summary-content").innerHTML = "<em>Click Generate to get an AI-powered trip summary and tips.</em>";
}

async function runAiSummary() {
  const btn = $("generate-summary-btn");
  btn.textContent = "Loading…";
  btn.disabled    = true;
  $("ai-summary-content").innerHTML = `<div class="ai-loading"><span class="spinner"></span> Generating…</div>`;
  try {
    const text = await generateTripSummary(state.activeTrip);
    $("ai-summary-content").innerHTML = text.replace(/\n/g, "<br/>");
  } catch (e) {
    $("ai-summary-content").innerHTML = `<span style="color:var(--accent-red)">Error: ${esc(e.message)}</span>`;
  }
  btn.textContent = "Regenerate";
  btn.disabled    = false;
}

// ============================================================
// ITINERARY TAB
// ============================================================
async function loadAndRenderItinerary(trip) {
  state.days = await getDays(trip.id);
  renderItinerary(trip);
}

function renderItinerary(trip) {
  const container = $("itinerary-container");
  if (!state.days.length) {
    container.innerHTML = `<div class="itinerary-empty">No days added yet. Click "Add Day" to start building your itinerary.</div>`;
    return;
  }
  container.innerHTML = state.days.map((day, i) => renderDayBlock(trip, day, i)).join("");

  // Attach event listeners
  container.querySelectorAll(".delete-day-btn").forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const ok = await confirmDialog("Delete this day and all its events?");
      if (!ok) return;
      await deleteDay(trip.id, btn.dataset.id);
      await loadAndRenderItinerary(trip);
    };
  });

  container.querySelectorAll(".edit-day-btn").forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); openEditDayModal(trip, btn.dataset.id); };
  });

  container.querySelectorAll(".add-event-btn").forEach(btn => {
    btn.onclick = () => openAddEventModal(trip, btn.dataset.dayid);
  });

  container.querySelectorAll(".delete-event-btn").forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const dayId  = btn.dataset.dayid;
      const day    = state.days.find(d => d.id === dayId);
      if (!day) return;
      const events = (day.events || []).filter((_, i) => i !== Number(btn.dataset.idx));
      await updateDay(trip.id, dayId, { events });
      await loadAndRenderItinerary(trip);
    };
  });

  container.querySelectorAll(".ai-day-btn").forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); runAiDaySuggest(trip, btn.dataset.id); };
  });
}

function renderDayBlock(trip, day, i) {
  const events = day.events || [];
  return `
    <div class="day-block">
      <div class="day-header">
        <div class="day-header-left">
          <div class="day-number">${i + 1}</div>
          <div>
            <div class="day-title-text">${esc(day.title || "Day " + (i + 1))}</div>
            ${day.date ? `<div class="day-date-text">${formatDate(day.date)}</div>` : ""}
          </div>
        </div>
        <div class="day-actions">
          <button class="btn-sm ai-day-btn" data-id="${day.id}" title="AI Suggest Events">✨</button>
          <button class="icon-btn edit-day-btn" data-id="${day.id}" title="Edit Day">✏️</button>
          <button class="icon-btn delete-day-btn" data-id="${day.id}" title="Delete Day">🗑</button>
        </div>
      </div>
      <div class="day-body">
        <div class="day-events">
          ${events.length ? events.map((ev, idx) => renderEvent(ev, day.id, idx)).join("") : `<div class="text-muted" style="font-size:0.8rem;padding:0.25rem 0">No events yet</div>`}
        </div>
        <button class="add-event-btn" data-dayid="${day.id}">＋ Add Event</button>
      </div>
    </div>
  `;
}

function renderEvent(ev, dayId, idx) {
  return `
    <div class="event-item">
      <div class="event-time">${esc(ev.time || "—")}</div>
      <div class="event-content">
        <div class="event-title">${CAT_ICONS[ev.category] || "📌"} ${esc(ev.title)}</div>
        ${ev.detail ? `<div class="event-detail">${esc(ev.detail)}</div>` : ""}
      </div>
      <span class="event-category ${catClass(ev.category)}">${esc(ev.category || "other")}</span>
      <button class="icon-btn delete-event-btn" data-dayid="${dayId}" data-idx="${idx}" title="Delete">✕</button>
    </div>
  `;
}

// Day modals
function openAddDayModal() {
  const dayNum = state.days.length + 1;
  // Auto-compute date if trip has startDate
  let defaultDate = "";
  if (state.activeTrip?.startDate) {
    const d = new Date(state.activeTrip.startDate + "T00:00:00");
    d.setDate(d.getDate() + state.days.length);
    defaultDate = d.toISOString().split("T")[0];
  }

  openModal("Add Day", `
    <div class="form-group">
      <label class="form-label">Day Title</label>
      <input class="form-input" id="day-title" placeholder="e.g. Arrival Day, Beach Day…" value="Day ${dayNum}" />
    </div>
    <div class="form-group">
      <label class="form-label">Date</label>
      <input class="form-input" id="day-date" type="date" value="${defaultDate}" />
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea class="form-textarea" id="day-notes" placeholder="Overview for the day…"></textarea>
    </div>
  `, `
    <button class="btn-ghost" id="day-cancel">Cancel</button>
    <button class="btn-primary" id="day-save">Add Day</button>
  `);

  $("day-cancel").onclick = closeModal;
  $("day-save").onclick = async () => {
    const title = $("day-title").value.trim() || `Day ${dayNum}`;
    await addDay(state.activeTrip.id, {
      title, date: $("day-date").value, notes: $("day-notes").value.trim(),
      dayIndex: state.days.length, events: []
    });
    closeModal();
    await loadAndRenderItinerary(state.activeTrip);
    showToast("Day added");
  };
}

function openEditDayModal(trip, dayId) {
  const day = state.days.find(d => d.id === dayId);
  if (!day) return;
  openModal("Edit Day", `
    <div class="form-group">
      <label class="form-label">Day Title</label>
      <input class="form-input" id="eday-title" value="${esc(day.title || "")}" />
    </div>
    <div class="form-group">
      <label class="form-label">Date</label>
      <input class="form-input" id="eday-date" type="date" value="${day.date || ""}" />
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea class="form-textarea" id="eday-notes">${esc(day.notes || "")}</textarea>
    </div>
  `, `
    <button class="btn-ghost" id="eday-cancel">Cancel</button>
    <button class="btn-primary" id="eday-save">Save</button>
  `);
  $("eday-cancel").onclick = closeModal;
  $("eday-save").onclick = async () => {
    await updateDay(trip.id, dayId, {
      title: $("eday-title").value.trim(),
      date:  $("eday-date").value,
      notes: $("eday-notes").value.trim()
    });
    closeModal();
    await loadAndRenderItinerary(trip);
    showToast("Day updated");
  };
}

function openAddEventModal(trip, dayId) {
  openModal("Add Event", `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Time</label>
        <input class="form-input" id="ev-time" type="time" />
      </div>
      <div class="form-group">
        <label class="form-label">Category</label>
        <select class="form-select" id="ev-cat">
          <option value="activity">🎯 Activity</option>
          <option value="food">🍽️ Food</option>
          <option value="transport">🚗 Transport</option>
          <option value="lodging">🏨 Lodging</option>
          <option value="other">📌 Other</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Event Title *</label>
      <input class="form-input" id="ev-title" placeholder="e.g. Visit Eiffel Tower" />
    </div>
    <div class="form-group">
      <label class="form-label">Details / Notes</label>
      <textarea class="form-textarea" id="ev-detail" placeholder="Address, booking info, tips…"></textarea>
    </div>
  `, `
    <button class="btn-ghost" id="ev-cancel">Cancel</button>
    <button class="btn-primary" id="ev-save">Add Event</button>
  `);
  $("ev-cancel").onclick = closeModal;
  $("ev-save").onclick = async () => {
    const title = $("ev-title").value.trim();
    if (!title) { showToast("Title required", "error"); return; }
    const day    = state.days.find(d => d.id === dayId);
    const events = [...(day.events || []), {
      time: $("ev-time").value, title,
      detail: $("ev-detail").value.trim(), category: $("ev-cat").value
    }];
    await updateDay(trip.id, dayId, { events });
    closeModal();
    await loadAndRenderItinerary(trip);
    showToast("Event added");
  };
}

async function runAiDaySuggest(trip, dayId) {
  const day = state.days.find(d => d.id === dayId);
  if (!day) return;
  const btn = document.querySelector(`.ai-day-btn[data-id="${dayId}"]`);
  if (btn) { btn.textContent = "⏳"; btn.disabled = true; }
  try {
    const result = await suggestDayItinerary(trip, day);
    const events = [...(day.events || []), ...(result.events || [])];
    await updateDay(trip.id, dayId, { events });
    await loadAndRenderItinerary(trip);
    showToast("AI events added! Review and edit as needed.", "success");
  } catch (e) {
    showToast("AI error: " + e.message, "error");
  }
  if (btn) { btn.textContent = "✨"; btn.disabled = false; }
}

// ============================================================
// PACKING TAB
// ============================================================
async function loadAndRenderPacking(trip) {
  state.packingItems = await getPackingItems(trip.id);
  renderPacking();
}

function renderPacking() {
  const container = $("packing-categories");
  if (!state.packingItems.length) {
    container.innerHTML = `<div class="itinerary-empty">No items yet. Add items or use ✨ AI to generate a list.</div>`;
    $("packing-summary").textContent = "";
    return;
  }

  // Group by category
  const groups = {};
  state.packingItems.forEach(item => {
    const cat = item.category || "General";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  });

  container.innerHTML = Object.entries(groups).map(([cat, items]) => {
    const checked = items.filter(i => i.checked).length;
    return `
      <div class="packing-category">
        <div class="packing-cat-header">
          <div class="packing-cat-name">${esc(cat)}</div>
          <div class="packing-cat-progress">${checked}/${items.length}</div>
        </div>
        <div class="packing-items">
          ${items.map(item => `
            <div class="packing-item">
              <div class="packing-checkbox ${item.checked ? "checked" : ""}" data-id="${item.id}"></div>
              <div class="packing-item-name ${item.checked ? "done" : ""}">${esc(item.name)}</div>
              ${item.qty > 1 ? `<div class="packing-qty">×${item.qty}</div>` : ""}
              <button class="icon-btn" data-del-packing="${item.id}" title="Delete">✕</button>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }).join("");

  const total   = state.packingItems.length;
  const checked = state.packingItems.filter(i => i.checked).length;
  $("packing-summary").textContent = `${checked} of ${total} items packed`;

  container.querySelectorAll(".packing-checkbox").forEach(el => {
    el.onclick = async () => {
      const item = state.packingItems.find(i => i.id === el.dataset.id);
      if (!item) return;
      await updatePackingItem(state.activeTrip.id, item.id, { checked: !item.checked });
      await loadAndRenderPacking(state.activeTrip);
    };
  });

  container.querySelectorAll("[data-del-packing]").forEach(el => {
    el.onclick = async () => {
      await deletePackingItem(state.activeTrip.id, el.dataset.delPacking);
      await loadAndRenderPacking(state.activeTrip);
    };
  });
}

function openAddPackingModal() {
  openModal("Add Packing Item", `
    <div class="form-group">
      <label class="form-label">Item Name *</label>
      <input class="form-input" id="pk-name" placeholder="e.g. Sunscreen" />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Category</label>
        <input class="form-input" id="pk-cat" placeholder="e.g. Toiletries" list="pk-cat-list" />
        <datalist id="pk-cat-list">
          <option value="Clothing"/>
          <option value="Toiletries"/>
          <option value="Electronics"/>
          <option value="Documents"/>
          <option value="Health &amp; Safety"/>
          <option value="Accessories"/>
          <option value="Food &amp; Snacks"/>
          <option value="General"/>
        </datalist>
      </div>
      <div class="form-group">
        <label class="form-label">Quantity</label>
        <input class="form-input" id="pk-qty" type="number" min="1" value="1" />
      </div>
    </div>
  `, `
    <button class="btn-ghost" id="pk-cancel">Cancel</button>
    <button class="btn-primary" id="pk-save">Add Item</button>
  `);
  $("pk-cancel").onclick = closeModal;
  $("pk-save").onclick = async () => {
    const name = $("pk-name").value.trim();
    if (!name) { showToast("Item name required", "error"); return; }
    await addPackingItem(state.activeTrip.id, {
      name, category: $("pk-cat").value.trim() || "General",
      qty: Number($("pk-qty").value) || 1, checked: false
    });
    closeModal();
    await loadAndRenderPacking(state.activeTrip);
    showToast("Item added");
  };
}

async function runAiPacking() {
  const btn = $("ai-packing-btn");
  btn.textContent = "⏳ Loading…";
  btn.disabled = true;
  try {
    const result = await generatePackingList(state.activeTrip);
    let added = 0;
    for (const cat of (result.categories || [])) {
      for (const item of (cat.items || [])) {
        await addPackingItem(state.activeTrip.id, {
          name: item.name, category: cat.name,
          qty: item.qty || 1, checked: false
        });
        added++;
      }
    }
    await loadAndRenderPacking(state.activeTrip);
    showToast(`${added} items added from AI! Review and customize.`, "success");
  } catch (e) {
    showToast("AI error: " + e.message, "error");
  }
  btn.textContent = "✨ AI Suggest";
  btn.disabled = false;
}

// ============================================================
// BUDGET TAB
// ============================================================
async function loadAndRenderBudget(trip) {
  state.expenses = await getExpenses(trip.id);
  renderBudget(trip);
}

function renderBudget(trip) {
  const totalBudget  = Number(trip.budget) || 0;
  const totalSpent   = state.expenses.reduce((s, e) => s + Number(e.amount), 0);
  const remaining    = totalBudget - totalSpent;
  const pct          = totalBudget ? Math.min(100, (totalSpent / totalBudget) * 100) : 0;
  const over         = totalSpent > totalBudget && totalBudget > 0;

  $("budget-overview").innerHTML = `
    <div class="budget-totals">
      <div class="budget-total-item">
        <div class="budget-total-label">Budget</div>
        <div class="budget-total-value">$${totalBudget ? totalBudget.toLocaleString() : "—"}</div>
      </div>
      <div class="budget-total-item">
        <div class="budget-total-label">Spent</div>
        <div class="budget-total-value">$${totalSpent.toLocaleString("en-US", {minimumFractionDigits:2,maximumFractionDigits:2})}</div>
      </div>
      ${totalBudget ? `
      <div class="budget-total-item">
        <div class="budget-total-label">${over ? "Over" : "Remaining"}</div>
        <div class="budget-total-value ${over ? "over" : "ok"}">$${Math.abs(remaining).toLocaleString("en-US", {minimumFractionDigits:2,maximumFractionDigits:2})}</div>
      </div>` : ""}
    </div>
    ${totalBudget ? `
    <div class="budget-bars" style="margin-top:1rem;">
      <div class="budget-bar-item">
        <div class="budget-bar-label"><span>Total Progress</span><span>${Math.round(pct)}%</span></div>
        <div class="budget-bar-track">
          <div class="budget-bar-fill ${over ? "over" : ""}" style="width:${pct}%"></div>
        </div>
      </div>
    </div>` : ""}
  `;

  const expList = $("expenses-list");
  if (!state.expenses.length) {
    expList.innerHTML = `<div class="itinerary-empty">No expenses tracked yet.</div>`;
    return;
  }
  expList.innerHTML = state.expenses.map(exp => `
    <div class="expense-item">
      <div class="expense-left">
        <div class="expense-icon">${EXPENSE_ICONS[exp.category] || "💸"}</div>
        <div>
          <div class="expense-name">${esc(exp.name)}</div>
          <div class="expense-cat">${esc(exp.category || "other")} ${exp.date ? "· " + formatDate(exp.date) : ""}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem;">
        <div class="expense-amount">$${Number(exp.amount).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
        <button class="icon-btn" data-del-exp="${exp.id}">✕</button>
      </div>
    </div>
  `).join("");

  expList.querySelectorAll("[data-del-exp]").forEach(btn => {
    btn.onclick = async () => {
      await deleteExpense(state.activeTrip.id, btn.dataset.delExp);
      await loadAndRenderBudget(state.activeTrip);
    };
  });
}

function openAddExpenseModal() {
  openModal("Add Expense", `
    <div class="form-group">
      <label class="form-label">Description *</label>
      <input class="form-input" id="exp-name" placeholder="e.g. Hotel Night 1" />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Amount ($) *</label>
        <input class="form-input" id="exp-amount" type="number" min="0" step="0.01" placeholder="0.00" />
      </div>
      <div class="form-group">
        <label class="form-label">Category</label>
        <select class="form-select" id="exp-cat">
          <option value="transport">✈️ Transport</option>
          <option value="lodging">🏨 Lodging</option>
          <option value="food">🍔 Food</option>
          <option value="activity">🎡 Activity</option>
          <option value="shopping">🛍️ Shopping</option>
          <option value="other">💸 Other</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Date</label>
      <input class="form-input" id="exp-date" type="date" />
    </div>
  `, `
    <button class="btn-ghost" id="exp-cancel">Cancel</button>
    <button class="btn-primary" id="exp-save">Add Expense</button>
  `);
  $("exp-cancel").onclick = closeModal;
  $("exp-save").onclick = async () => {
    const name   = $("exp-name").value.trim();
    const amount = parseFloat($("exp-amount").value);
    if (!name || isNaN(amount)) { showToast("Name and amount required", "error"); return; }
    await addExpense(state.activeTrip.id, {
      name, amount, category: $("exp-cat").value, date: $("exp-date").value
    });
    closeModal();
    await loadAndRenderBudget(state.activeTrip);
    showToast("Expense added");
  };
}

// ============================================================
// NOTES TAB
// ============================================================
async function loadAndRenderNotes(trip) {
  state.notes = await getNotes(trip.id);
  renderNotes();
}

function renderNotes() {
  const container = $("notes-container");
  if (!state.notes.length) {
    container.innerHTML = `<div class="itinerary-empty">No notes yet. Capture ideas, links, or anything useful.</div>`;
    container.style.display = "block";
    return;
  }
  container.style.display = "grid";
  container.innerHTML = state.notes.map(note => `
    <div class="note-card" data-id="${note.id}">
      <div class="note-title">${esc(note.title || "Untitled")}</div>
      <div class="note-content">${esc(note.content || "")}</div>
      <div class="note-date">${note.createdAt?.toDate ? note.createdAt.toDate().toLocaleDateString() : ""}</div>
      <div class="note-actions">
        <button class="btn-sm note-edit-btn" data-id="${note.id}">Edit</button>
        <button class="btn-sm note-del-btn" data-id="${note.id}" style="color:var(--accent-red)">Delete</button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll(".note-edit-btn").forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); openEditNoteModal(btn.dataset.id); };
  });
  container.querySelectorAll(".note-del-btn").forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      await deleteNote(state.activeTrip.id, btn.dataset.id);
      await loadAndRenderNotes(state.activeTrip);
    };
  });
}

function openAddNoteModal() {
  openModal("Add Note", `
    <div class="form-group">
      <label class="form-label">Title</label>
      <input class="form-input" id="note-title" placeholder="e.g. Restaurant ideas" />
    </div>
    <div class="form-group">
      <label class="form-label">Content *</label>
      <textarea class="form-textarea" id="note-content" style="min-height:120px;" placeholder="Write anything…"></textarea>
    </div>
  `, `
    <button class="btn-ghost" id="note-cancel">Cancel</button>
    <button class="btn-primary" id="note-save">Save Note</button>
  `);
  $("note-cancel").onclick = closeModal;
  $("note-save").onclick = async () => {
    const content = $("note-content").value.trim();
    if (!content) { showToast("Content required", "error"); return; }
    await addNote(state.activeTrip.id, { title: $("note-title").value.trim(), content });
    closeModal();
    await loadAndRenderNotes(state.activeTrip);
    showToast("Note saved");
  };
}

function openEditNoteModal(noteId) {
  const note = state.notes.find(n => n.id === noteId);
  if (!note) return;
  openModal("Edit Note", `
    <div class="form-group">
      <label class="form-label">Title</label>
      <input class="form-input" id="enote-title" value="${esc(note.title || "")}" />
    </div>
    <div class="form-group">
      <label class="form-label">Content</label>
      <textarea class="form-textarea" id="enote-content" style="min-height:120px;">${esc(note.content || "")}</textarea>
    </div>
  `, `
    <button class="btn-ghost" id="enote-cancel">Cancel</button>
    <button class="btn-primary" id="enote-save">Save</button>
  `);
  $("enote-cancel").onclick = closeModal;
  $("enote-save").onclick = async () => {
    await updateNote(state.activeTrip.id, noteId, {
      title: $("enote-title").value.trim(),
      content: $("enote-content").value.trim()
    });
    closeModal();
    await loadAndRenderNotes(state.activeTrip);
    showToast("Note updated");
  };
}

// ============================================================
// TRIP MODALS — Create / Edit
// ============================================================
function tripFormHTML(trip = {}) {
  const typeOpts = TRIP_TYPES.map(t => `
    <div class="type-option ${trip.type === t.id ? "selected" : ""}" data-type="${t.id}">
      <span class="type-option-icon">${t.icon}</span>
      ${t.label}
    </div>
  `).join("");

  return `
    <div class="form-group">
      <label class="form-label">Trip Name *</label>
      <input class="form-input" id="t-name" placeholder="e.g. Summer Road Trip" value="${esc(trip.name || "")}" />
    </div>
    <div class="form-group">
      <label class="form-label">Trip Type</label>
      <div class="type-selector" id="type-selector">${typeOpts}</div>
      <input type="hidden" id="t-type" value="${trip.type || "vacation"}" />
    </div>
    <div class="form-group">
      <label class="form-label">Destination(s)</label>
      <input class="form-input" id="t-dest" placeholder="e.g. Paris, Rome" value="${esc(trip.destinations || "")}" />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Start Date</label>
        <input class="form-input" id="t-start" type="date" value="${trip.startDate || ""}" />
      </div>
      <div class="form-group">
        <label class="form-label">End Date</label>
        <input class="form-input" id="t-end" type="date" value="${trip.endDate || ""}" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Travelers</label>
        <input class="form-input" id="t-travelers" type="number" min="1" value="${trip.travelers || 1}" />
      </div>
      <div class="form-group">
        <label class="form-label">Budget ($)</label>
        <input class="form-input" id="t-budget" type="number" min="0" placeholder="0" value="${trip.budget || ""}" />
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Status</label>
      <select class="form-select" id="t-status">
        <option value="planning" ${trip.status === "planning" ? "selected" : ""}>Planning</option>
        <option value="booked"   ${trip.status === "booked"   ? "selected" : ""}>Booked</option>
        <option value="active"   ${trip.status === "active"   ? "selected" : ""}>Active</option>
        <option value="complete" ${trip.status === "complete" ? "selected" : ""}>Complete</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Description / Notes</label>
      <textarea class="form-textarea" id="t-desc" placeholder="What's this trip about?">${esc(trip.description || "")}</textarea>
    </div>
  `;
}

function bindTypeSelector() {
  document.querySelectorAll(".type-option").forEach(el => {
    el.onclick = () => {
      document.querySelectorAll(".type-option").forEach(e => e.classList.remove("selected"));
      el.classList.add("selected");
      $("t-type").value = el.dataset.type;
    };
  });
}

function collectTripForm() {
  return {
    name:         $("t-name").value.trim(),
    type:         $("t-type").value,
    destinations: $("t-dest").value.trim(),
    startDate:    $("t-start").value,
    endDate:      $("t-end").value,
    travelers:    Number($("t-travelers").value) || 1,
    budget:       $("t-budget").value ? Number($("t-budget").value) : null,
    status:       $("t-status").value,
    description:  $("t-desc").value.trim()
  };
}

function openNewTripModal() {
  openModal("Create New Trip", tripFormHTML(), `
    <button class="btn-ghost" id="t-cancel">Cancel</button>
    <button class="btn-primary" id="t-save">Create Trip ✈️</button>
  `);
  bindTypeSelector();
  $("t-cancel").onclick = closeModal;
  $("t-save").onclick = async () => {
    const data = collectTripForm();
    if (!data.name) { showToast("Trip name required", "error"); return; }
    const id = await createTrip(data);
    closeModal();
    await loadTrips();
    openTrip(id);
    showToast("Trip created! 🎉", "success");
  };
}

function openEditTripModal(trip) {
  openModal("Edit Trip", tripFormHTML(trip), `
    <button class="btn-ghost" id="t-cancel">Cancel</button>
    <button class="btn-primary" id="t-save">Save Changes</button>
  `);
  bindTypeSelector();
  $("t-cancel").onclick = closeModal;
  $("t-save").onclick = async () => {
    const data = collectTripForm();
    if (!data.name) { showToast("Trip name required", "error"); return; }
    await updateTrip(trip.id, data);
    closeModal();
    const updated = await getTrip(trip.id);
    state.activeTrip = updated;
    await loadTrips();
    renderTripHeader(updated);
    renderOverview(updated);
    showToast("Trip updated", "success");
  };
}

// ============================================================
// SETTINGS
// ============================================================
function openSettings() {
  $("settings-panel").classList.add("open");
  getMeta().then(meta => {
    if (meta?.apiKey) $("api-key-input").value = meta.apiKey;
  });
}
function closeSettings() { $("settings-panel").classList.remove("open"); }

async function saveApiKey() {
  const key = $("api-key-input").value.trim();
  if (!key) { showToast("Enter an API key", "error"); return; }
  await setMeta({ apiKey: key });
  showToast("API key saved securely", "success");
  closeSettings();
}

function openChangePinModal() {
  closeSettings();
  openModal("Change PIN", `
    <p style="color:var(--text-secondary);margin-bottom:1.5rem;">Enter and confirm your new PIN.</p>
    <div class="form-group">
      <label class="form-label">New PIN (4-6 digits)</label>
      <input class="form-input" id="new-pin" type="password" inputmode="numeric" maxlength="6" placeholder="••••" />
    </div>
    <div class="form-group">
      <label class="form-label">Confirm PIN</label>
      <input class="form-input" id="conf-pin" type="password" inputmode="numeric" maxlength="6" placeholder="••••" />
    </div>
  `, `
    <button class="btn-ghost" id="chpin-cancel">Cancel</button>
    <button class="btn-primary" id="chpin-save">Change PIN</button>
  `);
  $("chpin-cancel").onclick = closeModal;
  $("chpin-save").onclick = async () => {
    const np = $("new-pin").value;
    const cp = $("conf-pin").value;
    if (np.length < 4) { showToast("PIN must be at least 4 digits", "error"); return; }
    if (np !== cp) { showToast("PINs don't match", "error"); return; }
    await changePin(np);
    closeModal();
    showToast("PIN changed successfully", "success");
  };
}

// ============================================================
// MODAL close on overlay click
// ============================================================
function setupModalClose() {
  $("modal-overlay").addEventListener("click", (e) => {
    if (e.target === $("modal-overlay")) closeModal();
  });
}

function setupSettingsPanel() { /* handled in setupNav */ }

// ── XSS escape ────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ── KICK OFF ──────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", init);
