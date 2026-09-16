import { SourceAdapter } from "./sourceAdapter.interface.js";
import { DisasterEvent, SourceHealth, SourceHealthStatus } from "../types/disaster.js";

export class SACHETAdapter implements SourceAdapter {
  name = "SACHET (NDMA India)";
  private lastSuccess: Date | null = null;
  private lastError: string | null = null;
  private isDemoFallback = false;

  async fetch(): Promise<DisasterEvent[]> {
    try {
      // The public SACHET portal and CAP/RSS page are available, but a stable documented developer API is not guaranteed. 
      // Do not depend on undocumented internal browser endpoints. Implement a safe adapter and a seeded fallback.
      // Display "Cached/Demo data" when live ingestion is unavailable.
      
      // Attempting to fetch from CAP Feed. This might fail due to CORS/Access restrictions.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch("https://sachet.ndma.gov.in/CapFeed/api/alerts", { signal: controller.signal })
        .catch(() => null); // Catch network errors safely
      clearTimeout(timeoutId);

      if (!res || !res.ok) {
        throw new Error("SACHET live feed unavailable or restricted.");
      }
      
      const data = await res.json();
      this.lastSuccess = new Date();
      this.lastError = null;
      this.isDemoFallback = false;
      return this.normalize(data);
    } catch (err: any) {
      this.lastError = err.message;
      this.isDemoFallback = true;
      console.warn("SACHET fetch failed (expected if no API key/access), using demo fallback:", err.message);
      return this.getFallbackData();
    }
  }

  normalize(raw: any): DisasterEvent[] {
    // If the API was ever open, we would parse CAP XML/JSON here.
    // For now, we return empty to force fallback, or parse if structured.
    return []; 
  }

  validate(event: any): boolean {
    return true;
  }

  getHealth(): SourceHealth {
    let status: SourceHealthStatus = "healthy";
    if (this.isDemoFallback) status = "degraded"; // Degraded rather than offline since we expect this
    
    return {
      name: this.name,
      status,
      lastSuccess: this.lastSuccess,
      lastError: this.lastError,
      isDemoFallback: this.isDemoFallback,
      message: this.isDemoFallback ? "Using cached/demo India alerts." : "Live connection established."
    };
  }

  getLastSuccess(): Date | null {
    return this.lastSuccess;
  }

  getFallbackData(): DisasterEvent[] {
    const now = new Date();
    // Create demo station data for Assam, Bihar, Odisha, Kerala, Delhi/Rajasthan
    return [
      {
        id: `sachet-demo-flood-assam-${now.getTime()}`,
        source: "SACHET",
        sourceAgency: "NDMA",
        hazardType: "flood",
        title: "Severe Flood Warning",
        location: "Guwahati, Assam",
        latitude: 26.1445,
        longitude: 91.7362,
        state: "Assam",
        district: "Kamrup Metropolitan",
        severity: "Critical",
        verificationStatus: "official_warning",
        urgency: "immediate",
        certainty: "observed",
        instructions: ["Move to higher ground immediately.", "Avoid crossing flooded rivers."],
        issuedAt: now.toISOString(),
        validUntil: new Date(now.getTime() + 86400000).toISOString(),
        color: "text-saffron-400", // Will configure tailwind for this later, or use existing orange
        dot: "bg-orange-500",
      },
      {
        id: `sachet-demo-cyclone-odisha-${now.getTime()}`,
        source: "SACHET",
        sourceAgency: "NDMA",
        hazardType: "cyclone",
        title: "Cyclone Alert",
        location: "Puri Coast, Odisha",
        latitude: 19.8135,
        longitude: 85.8312,
        state: "Odisha",
        district: "Puri",
        severity: "High",
        verificationStatus: "official_warning",
        urgency: "expected",
        certainty: "likely",
        instructions: ["Fishermen are advised not to venture into the sea.", "Evacuate low lying areas."],
        issuedAt: now.toISOString(),
        validUntil: new Date(now.getTime() + 172800000).toISOString(),
        color: "text-rose-400",
        dot: "bg-rose-500",
      },
      {
        id: `sachet-demo-rain-kerala-${now.getTime()}`,
        source: "SACHET",
        sourceAgency: "NDMA",
        hazardType: "heavy_rain",
        title: "Heavy Rainfall Warning",
        location: "Wayanad, Kerala",
        latitude: 11.6854,
        longitude: 76.1320,
        state: "Kerala",
        district: "Wayanad",
        severity: "Warning",
        verificationStatus: "official_warning",
        urgency: "expected",
        certainty: "likely",
        issuedAt: now.toISOString(),
        color: "text-amber-400",
        dot: "bg-amber-500",
      },
      {
        id: `sachet-demo-heatwave-rajasthan-${now.getTime()}`,
        source: "SACHET",
        sourceAgency: "NDMA",
        hazardType: "heatwave",
        title: "Severe Heatwave",
        location: "Jaisalmer, Rajasthan",
        latitude: 26.9157,
        longitude: 70.9083,
        state: "Rajasthan",
        district: "Jaisalmer",
        severity: "High",
        verificationStatus: "official_warning",
        instructions: ["Stay indoors during peak hours.", "Stay hydrated."],
        issuedAt: now.toISOString(),
        color: "text-red-400",
        dot: "bg-red-500",
      },
      {
        id: `sachet-demo-thunderstorm-delhi-${now.getTime()}`,
        source: "SACHET",
        sourceAgency: "NDMA",
        hazardType: "thunderstorm",
        title: "Thunderstorm & Lightning",
        location: "New Delhi",
        latitude: 28.6139,
        longitude: 77.2090,
        state: "Delhi",
        district: "New Delhi",
        severity: "Warning",
        verificationStatus: "official_warning",
        issuedAt: now.toISOString(),
        color: "text-yellow-400",
        dot: "bg-yellow-500",
      }
    ];
  }
}
