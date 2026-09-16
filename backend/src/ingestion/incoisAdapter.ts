import { SourceAdapter } from "./sourceAdapter.interface.js";
import { DisasterEvent, SourceHealth, SourceHealthStatus } from "../types/disaster.js";

export class INCOISAdapter implements SourceAdapter {
  name = "INCOIS (Indian National Centre for Ocean Information Services)";
  private lastSuccess: Date | null = null;
  private lastError: string | null = null;
  private isDemoFallback = false;

  async fetch(): Promise<DisasterEvent[]> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch("https://incois.gov.in/portal/osf/alerts.json", { signal: controller.signal })
        .catch(() => null);
      clearTimeout(timeoutId);

      if (!res || !res.ok) {
        throw new Error("INCOIS Ocean Advisory API restricted.");
      }

      const data = await res.json();
      this.lastSuccess = new Date();
      this.lastError = null;
      this.isDemoFallback = false;
      return this.normalize(data);
    } catch (err: any) {
      this.lastError = err.message;
      this.isDemoFallback = true;
      return this.getFallbackData();
    }
  }

  normalize(raw: any): DisasterEvent[] {
    if (!Array.isArray(raw)) return [];
    const events: DisasterEvent[] = [];
    const now = new Date();

    for (const item of raw) {
      if (!item.lat || !item.lon) continue;
      events.push({
        id: `incois-${item.id || Math.random().toString(36).substring(2, 9)}`,
        source: "INCOIS",
        sourceAgency: "Indian National Centre for Ocean Information Services",
        sourceUrl: "https://incois.gov.in",
        hazardType: item.type === "tsunami" ? "tsunami" : "storm",
        title: item.title || "Ocean Hazard Warning",
        location: item.location || "Coastal Zone, India",
        latitude: parseFloat(item.lat),
        longitude: parseFloat(item.lon),
        state: item.state,
        district: item.district,
        severity: item.severity || "Warning",
        urgency: "expected",
        certainty: "likely",
        verificationStatus: "official_warning",
        issuedAt: item.issuedAt || now.toISOString(),
        instructions: item.instructions || ["Fishermen and coastal dwellers follow port warnings."],
        color: "text-cyan-400",
        dot: "bg-cyan-500",
      });
    }

    return events;
  }

  validate(event: any): boolean {
    return true;
  }

  getHealth(): SourceHealth {
    return {
      name: this.name,
      status: this.isDemoFallback ? "degraded" : "healthy",
      lastSuccess: this.lastSuccess,
      lastError: this.lastError,
      isDemoFallback: this.isDemoFallback,
      message: this.isDemoFallback ? "Using INCOIS ocean state & coastal advisory fallback." : "Live INCOIS advisory active."
    };
  }

  getLastSuccess(): Date | null {
    return this.lastSuccess;
  }

  getFallbackData(): DisasterEvent[] {
    const now = new Date();
    return [
      {
        id: `incois-high-wave-kerala-${now.getTime()}`,
        source: "INCOIS",
        sourceAgency: "INCOIS Ocean State Forecast",
        sourceUrl: "https://incois.gov.in",
        hazardType: "storm",
        title: "INCOIS High Wave Warning & Swell Surge Alert",
        location: "Kollam to Vizhinjam Coast, Kerala",
        latitude: 8.8932,
        longitude: 76.5567,
        state: "Kerala",
        district: "Kollam",
        severity: "High",
        urgency: "expected",
        certainty: "likely",
        verificationStatus: "official_warning",
        issuedAt: now.toISOString(),
        validUntil: new Date(now.getTime() + 86400000).toISOString(),
        instructions: [
          "High waves in the range of 3.2 - 4.1 meters forecasted along Kerala coast.",
          "Low-lying coastal areas subject to sea surge (Kallakkadal). Small boats prohibited."
        ],
        magnitude: "3.8m waves",
        magnitudeUnit: "m",
        color: "text-cyan-400",
        dot: "bg-cyan-500",
      },
      {
        id: `incois-tsunami-watch-andaman-${now.getTime()}`,
        source: "INCOIS",
        sourceAgency: "ITEWC (Indian Tsunami Early Warning Centre)",
        sourceUrl: "https://incois.gov.in/itewc",
        hazardType: "tsunami",
        title: "INCOIS Ocean Tsunami Advisory / Watch - Indian Ocean",
        location: "Car Nicobar & Port Blair, Andaman & Nicobar Islands",
        latitude: 9.1550,
        longitude: 92.7660,
        state: "Andaman and Nicobar Islands",
        district: "Nicobar",
        severity: "Warning",
        urgency: "past",
        certainty: "possible",
        verificationStatus: "official_warning",
        issuedAt: now.toISOString(),
        validUntil: new Date(now.getTime() + 43200000).toISOString(),
        instructions: [
          "No destructive tsunami threat to Indian mainland. Sea level monitoring active post M6.8 Sumatra quake.",
          "Port authorities stay tuned to ITEWC bulletins."
        ],
        magnitude: "Normal Sea Level",
        color: "text-blue-400",
        dot: "bg-blue-500",
      }
    ];
  }
}
