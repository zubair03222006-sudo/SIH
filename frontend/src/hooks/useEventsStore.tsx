import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { LiveEvent, HazardType } from "../lib/api/live-data";

/* ─── API configuration ──────────────────────────────────────────────────────── */

const API_BASE = import.meta.env.VITE_BACKEND_URL || "";

/* ─── severity helpers ──────────────────────────────────────────────────────── */

const SEVERITY_RANK: Record<string, number> = {
  Critical: 4,
  High: 3,
  Warning: 2,
  Info: 1,
};

const HAZARD_DEFAULTS: Record<HazardType, { color: string; dot: string; magnitudeUnit: string }> = {
  earthquake:   { color: "text-rose-300",   dot: "bg-rose-400",   magnitudeUnit: "Mw" },
  wildfire:     { color: "text-orange-300", dot: "bg-orange-400", magnitudeUnit: "acres" },
  storm:        { color: "text-violet-300", dot: "bg-violet-400", magnitudeUnit: "kts" },
  volcano:      { color: "text-red-400",    dot: "bg-red-500",    magnitudeUnit: "" },
  flood:        { color: "text-sky-300",    dot: "bg-sky-400",    magnitudeUnit: "" },
  heavy_rain:   { color: "text-blue-300",   dot: "bg-blue-400",   magnitudeUnit: "mm" },
  landslide:    { color: "text-amber-400",  dot: "bg-amber-500",  magnitudeUnit: "" },
  cyclone:      { color: "text-emerald-300",dot: "bg-emerald-400",magnitudeUnit: "km/h" },
  lightning:    { color: "text-yellow-300", dot: "bg-yellow-400", magnitudeUnit: "strikes" },
  thunderstorm: { color: "text-indigo-300", dot: "bg-indigo-400", magnitudeUnit: "" },
  tsunami:      { color: "text-cyan-300",   dot: "bg-cyan-400",   magnitudeUnit: "m" },
  heatwave:     { color: "text-red-500",    dot: "bg-red-600",    magnitudeUnit: "°C" },
  avalanche:    { color: "text-gray-300",   dot: "bg-gray-400",   magnitudeUnit: "" },
  other:        { color: "text-slate-300",  dot: "bg-slate-400",  magnitudeUnit: "" },
};

/* ─── context types ─────────────────────────────────────────────────────────── */

// Fallback demo events shown when backend is unreachable
const FALLBACK_EVENTS: LiveEvent[] = [
  {
    id: "demo-1", source: "USGS", sourceAgency: "USGS", hazardType: "earthquake",
    title: "Earthquake", location: "22km NE of Imphal, Manipur",
    latitude: 24.9, longitude: 94.0, coords: [24.9, 94.0],
    severity: "High", magnitude: "5.8", magnitudeUnit: "Mw",
    color: "text-amber-300", dot: "bg-amber-400", detected: "2h ago", affected: "~12,000",
    verificationStatus: "official_observation",
  },
  {
    id: "demo-2", source: "IMD", sourceAgency: "IMD", hazardType: "cyclone",
    title: "Cyclone Alert", location: "Bay of Bengal, Andhra Pradesh Coast",
    latitude: 14.5, longitude: 82.3, coords: [14.5, 82.3],
    severity: "Critical", magnitude: "165", magnitudeUnit: "km/h",
    color: "text-emerald-300", dot: "bg-emerald-400", detected: "5h ago", affected: "~200,000",
    verificationStatus: "official_observation",
  },
  {
    id: "demo-3", source: "CWC", sourceAgency: "CWC", hazardType: "flood",
    title: "Flash Flood Warning", location: "Assam — Brahmaputra River Basin",
    latitude: 26.2, longitude: 91.7, coords: [26.2, 91.7],
    severity: "High", magnitude: "—", magnitudeUnit: "",
    color: "text-sky-300", dot: "bg-sky-400", detected: "1h ago", affected: "~45,000",
    verificationStatus: "official_observation",
  },
  {
    id: "demo-4", source: "NASA FIRMS", sourceAgency: "NASA", hazardType: "wildfire",
    title: "Active Wildfire", location: "Uttarakhand Forest Range",
    latitude: 30.3, longitude: 79.5, coords: [30.3, 79.5],
    severity: "High", magnitude: "340", magnitudeUnit: "acres",
    color: "text-orange-300", dot: "bg-orange-400", detected: "3h ago", affected: "—",
    verificationStatus: "satellite_derived",
  },
  {
    id: "demo-5", source: "IMD", sourceAgency: "IMD", hazardType: "heatwave",
    title: "Severe Heatwave", location: "Rajasthan — Barmer District",
    latitude: 25.7, longitude: 71.4, coords: [25.7, 71.4],
    severity: "Warning", magnitude: "48.2", magnitudeUnit: "°C",
    color: "text-red-400", dot: "bg-red-500", detected: "6h ago", affected: "~80,000",
    verificationStatus: "official_observation",
  },
  {
    id: "demo-6", source: "INCOIS", sourceAgency: "INCOIS", hazardType: "tsunami",
    title: "Tsunami Watch", location: "Andaman & Nicobar Islands",
    latitude: 11.7, longitude: 92.8, coords: [11.7, 92.8],
    severity: "Warning", magnitude: "0.8", magnitudeUnit: "m",
    color: "text-cyan-300", dot: "bg-cyan-400", detected: "30m ago", affected: "—",
    verificationStatus: "official_observation",
  },
];

export interface EventsState {
  events: LiveEvent[];
  loading: boolean;
  lastUpdated: Date | null;
  error: string | null;
  addEvent: (evt: Partial<LiveEvent> & { title: string; coords: [number, number]; hazardType: HazardType }) => LiveEvent;
  removeEvent: (id: string) => boolean;
  updateEvent: (id: string, patch: Partial<LiveEvent>) => boolean;
  clearCustomEvents: () => void;
  refreshLive: () => Promise<void>;
}

const EventsContext = createContext<EventsState | null>(null);

export function useEventsStore() {
  const ctx = useContext(EventsContext);
  if (!ctx) throw new Error("useEventsStore must be inside <EventsProvider>");
  return ctx;
}

/* ─── provider ──────────────────────────────────────────────────────────────── */

export function EventsProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/events`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      const evts: LiveEvent[] = data.events || [];
      // If backend returned 0 events (still warming up / all adapters failed), show fallback
      setEvents(evts.length > 0 ? evts : FALLBACK_EVENTS);
      setLastUpdated(data.lastUpdated ? new Date(data.lastUpdated) : null);
      setError(null);
    } catch (err) {
      console.error("Data fetch failed — using fallback demo data", err);
      // Show fallback India events so the globe is never empty
      setEvents(FALLBACK_EVENTS);
      setError("Offline: Connection to disaster command center lost. Showing demo data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
    const id = setInterval(loadEvents, 30 * 1000); // Poll backend every 30 seconds
    return () => clearInterval(id);
  }, [loadEvents]);

  const addEvent = useCallback(
    (partial: Partial<LiveEvent> & { title: string; coords: [number, number]; hazardType: HazardType }): LiveEvent => {
      const defaults = HAZARD_DEFAULTS[partial.hazardType] ?? HAZARD_DEFAULTS.other;
      const [lat, lng] = partial.coords;
      const newEvt = {
        title: partial.title,
        location: partial.location ?? partial.title,
        severity: partial.severity ?? "Warning",
        magnitude: partial.magnitude ?? "—",
        magnitudeUnit: partial.magnitudeUnit ?? defaults.magnitudeUnit,
        affected: partial.affected ?? "—",
        detected: "Just now",
        color: partial.color ?? defaults.color,
        dot: partial.dot ?? defaults.dot,
        coords: partial.coords,
        latitude: lat,
        longitude: lng,
        hazardType: partial.hazardType,
        source: partial.source ?? "Agent",
        sourceAgency: partial.sourceAgency ?? "Agent",
        verificationStatus: partial.verificationStatus ?? "ai_estimate",
      };

      // Optimistic update local state first
      const tempId = `temp-${Date.now()}`;
      const returnedEvt: LiveEvent = { ...newEvt, id: tempId };
      setEvents((prev) => [returnedEvt, ...prev].slice(0, 30));

      // Call backend and swap the tempId with the real ID
      fetch(`${API_BASE}/api/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newEvt),
      })
        .then((res) => {
          if (!res.ok) throw new Error("Failed to add event to backend");
          return res.json();
        })
        .then((realEvt) => {
          setEvents((prev) =>
            prev.map((e) => (e.id === tempId ? realEvt : e))
          );
        })
        .catch((err) => {
          console.error("Failed to add event on backend", err);
          // Rollback: remove temporary event
          setEvents((prev) => prev.filter((e) => e.id !== tempId));
        });

      return returnedEvt;
    },
    [],
  );


  const removeEvent = useCallback((id: string): boolean => {
    let found = false;
    setEvents((prev) => {
      const next = prev.filter((e) => e.id !== id);
      found = next.length < prev.length;
      return next;
    });

    // Call backend in background
    fetch(`${API_BASE}/api/events/${id}`, {
      method: "DELETE",
    })
      .then(() => loadEvents())
      .catch((err) => console.error("Failed to delete event", err));

    return found;
  }, [loadEvents]);

  const updateEvent = useCallback((id: string, patch: Partial<LiveEvent>): boolean => {
    // Optimistic local update
    setEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...patch } : e))
    );
    return true;
  }, []);

  const clearCustomEvents = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/events/clear`, { method: "POST" });
      await loadEvents();
    } catch (err) {
      console.error("Failed to clear custom events", err);
    }
  }, [loadEvents]);

  const refreshLive = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/events/refresh`, { method: "POST" });
      await loadEvents();
    } catch (err) {
      console.error("Failed to refresh live events", err);
    }
  }, [loadEvents]);

  return (
    <EventsContext.Provider
      value={{ events, loading, lastUpdated, error, addEvent, removeEvent, updateEvent, clearCustomEvents, refreshLive }}
    >
      {children}
    </EventsContext.Provider>
  );
}
