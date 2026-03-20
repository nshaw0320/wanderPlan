// ai.js — Anthropic API helpers
import { getMeta } from "./db.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL   = "claude-sonnet-4-20250514";

async function getApiKey() {
  const meta = await getMeta();
  return meta?.apiKey || null;
}

async function callAI(systemPrompt, userPrompt) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error("No API key saved. Add one in Settings.");

  const resp = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 1024,
      system:     systemPrompt,
      messages: [{ role: "user", content: userPrompt }]
    })
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${resp.status}`);
  }

  const data = await resp.json();
  return data.content?.[0]?.text || "";
}

// ── Trip Summary ──────────────────────────────────────────────────────────────
export async function generateTripSummary(trip) {
  const system = "You are a friendly and knowledgeable travel assistant. Respond in a warm, concise tone. 2-3 short paragraphs max.";
  const user   = `Generate a trip summary and useful tips for this trip:
Name: ${trip.name}
Type: ${trip.type}
Destination(s): ${trip.destinations || "Not specified"}
Dates: ${trip.startDate || "TBD"} – ${trip.endDate || "TBD"}
Travelers: ${trip.travelers || 1}
Budget: $${trip.budget || "Not set"}
Description: ${trip.description || "No description"}

Include: what to expect, a key tip, and anything to prepare.`;

  return callAI(system, user);
}

// ── Packing List ──────────────────────────────────────────────────────────────
export async function generatePackingList(trip) {
  const system = `You are a travel packing assistant. Return ONLY valid JSON — no markdown, no prose. 
Format: { "categories": [ { "name": "Clothing", "items": [ { "name": "T-shirts", "qty": 3 } ] } ] }`;

  const user   = `Generate a practical packing list for this trip:
Type: ${trip.type}
Destination: ${trip.destinations || "Unknown"}
Duration: ${trip.duration || "Unknown"}
Dates: ${trip.startDate || "TBD"} – ${trip.endDate || "TBD"}
Travelers: ${trip.travelers || 1}

Include 4-6 categories: Clothing, Toiletries, Documents, Electronics, Health & Safety, Accessories (as relevant). 
Return only the JSON object.`;

  const raw = await callAI(system, user);
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    throw new Error("AI returned an unexpected response. Try again.");
  }
}

// ── Day Itinerary Suggestion ──────────────────────────────────────────────────
export async function suggestDayItinerary(trip, day) {
  const system = "You are a travel itinerary expert. Return ONLY valid JSON — no markdown, no prose.";
  const user   = `Suggest a detailed itinerary for Day ${day.dayIndex + 1} of this trip.
Trip: ${trip.name}
Destination: ${trip.destinations || "Unknown"}
Day date: ${day.date || "Unknown"}
Day title: ${day.title || "Day " + (day.dayIndex + 1)}
Trip type: ${trip.type}

Return JSON: { "events": [ { "time": "09:00", "title": "...", "detail": "...", "category": "activity|food|transport|lodging|other" } ] }
Include 4-6 events. Return only the JSON.`;

  const raw = await callAI(system, user);
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    throw new Error("AI returned an unexpected response. Try again.");
  }
}
