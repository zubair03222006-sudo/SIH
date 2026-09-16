import { LiveEvent } from "../../types/sentinel";

// Re-exports from canonical Sentinel types
export type { LiveEvent, HazardType, DisasterEvent, VerificationStatus, Severity } from "../../types/sentinel";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

export async function fetchUSGS(): Promise<LiveEvent[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/events?source=USGS`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchEONET(): Promise<LiveEvent[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/events?source=EONET`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}
