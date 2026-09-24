import { Router } from "express";
import { pollingService } from "../jobs/sourcePolling.js";
import { DisasterEvent } from "../types/disaster.js";

const router = Router();

// In-Memory State for custom/simulated events
let customEvents: DisasterEvent[] = [];
const deletedEventIds = new Set<string>();

const SEVERITY_RANK: Record<string, number> = {
  Critical: 4,
  High: 3,
  Warning: 2,
  Info: 1,
};

function sortEvents(evts: DisasterEvent[]): DisasterEvent[] {
  return [...evts].sort((a, b) => {
    const sevDiff = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
    if (sevDiff !== 0) return sevDiff;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Adds legacy fields expected by existing frontend components:
 * - coords: [lat, lng] tuple (used by Markers.tsx, HUD.tsx, Dashboard.tsx, AgentChatBox.tsx)
 * - detected: relative time string (used by DisasterCard display)
 * - affected: display string (used by DisasterCard display)
 */
function normalizeForFrontend(e: DisasterEvent): DisasterEvent {
  const now = Date.now();
  let detectedStr = "Recently";
  if (e.observedAt || e.issuedAt) {
    const t = new Date(e.observedAt ?? e.issuedAt!).getTime();
    if (!isNaN(t)) {
      const mins = Math.floor((now - t) / 60000);
      if (mins < 60) detectedStr = `${mins}m ago`;
      else if (mins < 1440) detectedStr = `${Math.floor(mins / 60)}h ago`;
      else detectedStr = `${Math.floor(mins / 1440)}d ago`;
    }
  }
  return {
    ...e,
    coords: [e.latitude, e.longitude],
    detected: e.detected ?? detectedStr,
    affected: e.affected ?? (e.affectedPopulation ? `~${e.affectedPopulation.toLocaleString()}` : "—"),
  };
}

// 1. Get all events
router.get("/", async (req, res) => {
  await pollingService.ensureFresh();
  const allEvents = [...pollingService.getEvents(), ...customEvents];
  const filteredEvents = allEvents.filter((e) => !deletedEventIds.has(e.id));
  const sorted = sortEvents(filteredEvents).slice(0, 30).map(normalizeForFrontend);
  
  res.json({
    events: sorted,
    loading: pollingService.getEvents().length === 0,
    lastUpdated: new Date()
  });
});

// Get India only events (used by UI filter)
router.get("/india", async (req, res) => {
  await pollingService.ensureFresh();
  const allEvents = [...pollingService.getEvents(), ...customEvents];
  const filteredEvents = allEvents.filter((e) => !deletedEventIds.has(e.id));
  
  // Basic bounding box for India or source filter
  const indiaEvents = filteredEvents.filter(e => {
    // If it's from an Indian agency, include it
    if (e.sourceAgency === "NDMA" || e.sourceAgency === "IMD" || e.sourceAgency === "CWC") return true;
    
    // Otherwise, check bounding box roughly enclosing India (approx 8N-37N, 68E-97E)
    if (e.latitude >= 8 && e.latitude <= 37 && e.longitude >= 68 && e.longitude <= 97) return true;
    
    return false;
  });

  const sorted = sortEvents(indiaEvents).slice(0, 30).map(normalizeForFrontend);
  
  res.json({
    events: sorted,
    loading: pollingService.getEvents().length === 0,
    lastUpdated: new Date()
  });
});

// 2. Add custom simulated event
router.post("/", (req, res) => {
  const partial = req.body;
  if (!partial.title || !partial.coords || !partial.hazardType) {
    res.status(400).json({ error: "Missing required fields (title, coords, hazardType)" });
    return;
  }

  const coords = partial.coords;
  if (!Array.isArray(coords) || coords.length !== 2 || typeof coords[0] !== "number" || typeof coords[1] !== "number" || isNaN(coords[0]) || isNaN(coords[1])) {
    res.status(400).json({ error: "Invalid coordinates. Must be [latitude, longitude] numbers." });
    return;
  }
  if (coords[0] < -90 || coords[0] > 90 || coords[1] < -180 || coords[1] > 180) {
    res.status(400).json({ error: "Coordinates out of bounds (lat: -90 to 90, lng: -180 to 180)." });
    return;
  }

  const allowedHazardTypes = ["earthquake", "heavy_rain", "flood", "landslide", "cyclone", "wildfire", "lightning", "thunderstorm", "tsunami", "heatwave", "avalanche", "storm", "volcano", "other"];
  if (!allowedHazardTypes.includes(partial.hazardType)) {
    res.status(400).json({ error: `Invalid hazardType. Must be one of: ${allowedHazardTypes.join(", ")}` });
    return;
  }

  const allowedSeverities = ["Critical", "High", "Warning", "Info"];
  if (partial.severity && !allowedSeverities.includes(partial.severity)) {
    res.status(400).json({ error: `Invalid severity. Must be one of: ${allowedSeverities.join(", ")}` });
    return;
  }

  const id = `custom-${Date.now()}`;
  const newEvt: DisasterEvent = {
    id,
    title: partial.title,
    location: partial.location ?? partial.title,
    severity: partial.severity ?? "Warning",
    magnitude: partial.magnitude ?? "—",
    magnitudeUnit: partial.magnitudeUnit ?? "",
    affectedPopulation: partial.affected === "—" ? undefined : parseInt(partial.affected),
    issuedAt: new Date().toISOString(),
    detected: "Just now",
    affected: partial.affected ?? "—",
    color: partial.color ?? "text-slate-300",
    dot: partial.dot ?? "bg-slate-400",
    latitude: partial.coords[0],
    longitude: partial.coords[1],
    coords: [partial.coords[0], partial.coords[1]],
    hazardType: partial.hazardType,
    source: partial.source ?? "Agent",
    sourceAgency: "AEGIS Agent",
    verificationStatus: "ai_estimate"
  };

  customEvents.push(newEvt);
  res.status(201).json(newEvt);
});

// 3. Delete an event by ID
router.delete("/:id", (req, res) => {
  const { id } = req.params;
  
  const initialCustomLength = customEvents.length;
  customEvents = customEvents.filter((e) => e.id !== id);
  const foundInCustom = customEvents.length < initialCustomLength;

  deletedEventIds.add(id);

  res.json({ success: true, removedFromCustom: foundInCustom });
});

// 4. Clear all custom/simulated events
router.post("/clear", (req, res) => {
  customEvents = [];
  const liveDeleted = Array.from(deletedEventIds).filter(
    (id) => !id.startsWith("custom-") && !id.startsWith("temp-")
  );
  deletedEventIds.clear();
  liveDeleted.forEach((id) => deletedEventIds.add(id));
  res.json({ success: true });
});

// 5. Force update the live events cache
router.post("/refresh", async (req, res) => {
  await pollingService.fetchAll();
  res.json({ success: true, lastUpdated: new Date() });
});

export default router;
