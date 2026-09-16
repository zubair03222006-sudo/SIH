import { SourceAdapter } from "./sourceAdapter.interface.js";
import { DisasterEvent, SourceHealth, SourceHealthStatus, HazardType } from "../types/disaster.js";

const EONET_CATEGORY_MAP: Record<string, { hazardType: HazardType; baseTitle: string; baseSeverity: "Critical" | "High" | "Warning" | "Info"; color: string; dot: string; }> = {
  wildfires: { hazardType: "wildfire", baseTitle: "Wildfire", baseSeverity: "High", color: "text-orange-300", dot: "bg-orange-400" },
  severeStorms: { hazardType: "storm", baseTitle: "Severe Storm", baseSeverity: "High", color: "text-violet-300", dot: "bg-violet-400" },
  volcanoes: { hazardType: "volcano", baseTitle: "Volcano", baseSeverity: "Warning", color: "text-red-400", dot: "bg-red-500" },
  floods: { hazardType: "flood", baseTitle: "Flood", baseSeverity: "High", color: "text-sky-300", dot: "bg-sky-400" },
};

export class EONETAdapter implements SourceAdapter {
  name = "NASA EONET";
  private lastSuccess: Date | null = null;
  private lastError: string | null = null;
  private isDemoFallback = false;

  async fetch(): Promise<DisasterEvent[]> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=50&days=7", {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`EONET returned ${res.status}`);
      const data = await res.json();
      
      this.lastSuccess = new Date();
      this.lastError = null;
      this.isDemoFallback = false;

      return this.normalize(data);
    } catch (err: any) {
      this.lastError = err.message;
      this.isDemoFallback = true;
      console.error("EONET fetch failed, using fallback:", err);
      return this.getFallbackData();
    }
  }

  normalize(raw: any): DisasterEvent[] {
    if (!raw?.events) return [];

    const events: DisasterEvent[] = [];

    for (const event of raw.events) {
      if (!this.validate(event)) continue;

      const categoryId: string = event.categories?.[0]?.id ?? "other";
      const meta = EONET_CATEGORY_MAP[categoryId];
      if (!meta) continue;

      const geoPoints = event.geometry;
      const latest = geoPoints[geoPoints.length - 1];
      const mag: number | null = latest.magnitudeValue ?? null;
      const magUnit: string = latest.magnitudeUnit ?? "";
      
      let severity = meta.baseSeverity;
      if (categoryId === "wildfires" && mag !== null) {
        if (mag >= 10000) severity = "Critical";
        else if (mag >= 1000) severity = "High";
        else severity = "Warning";
      } else if (categoryId === "severeStorms" && mag !== null) {
        if (mag >= 100) severity = "Critical";
        else if (mag >= 64) severity = "High";
        else severity = "Warning";
      }

      events.push({
        id: event.id,
        source: "NASA EONET",
        sourceAgency: "NASA",
        sourceEventId: event.id,
        sourceUrl: event.link,
        hazardType: meta.hazardType,
        title: meta.baseTitle,
        location: event.title ?? meta.baseTitle,
        latitude: latest.coordinates[1],
        longitude: latest.coordinates[0],
        severity,
        magnitude: mag !== null ? `${mag}` : "—",
        magnitudeUnit: magUnit,
        color: meta.color,
        dot: meta.dot,
        verificationStatus: "satellite_detection",
        observedAt: new Date(latest.date).toISOString(),
        rawPayload: event
      });
    }

    return events;
  }

  validate(event: any): boolean {
    if (!event || !event.geometry || event.geometry.length === 0) return false;
    const latest = event.geometry[event.geometry.length - 1];
    if (!latest.coordinates || latest.coordinates.length < 2) return false;
    return true;
  }

  getHealth(): SourceHealth {
    let status: SourceHealthStatus = "healthy";
    if (this.isDemoFallback) status = "offline";
    else if (this.lastError) status = "degraded";
    
    return {
      name: this.name,
      status,
      lastSuccess: this.lastSuccess,
      lastError: this.lastError,
      isDemoFallback: this.isDemoFallback
    };
  }

  getLastSuccess(): Date | null {
    return this.lastSuccess;
  }

  getFallbackData(): DisasterEvent[] {
    return [
      {
        id: "eonet-demo-1",
        source: "NASA EONET",
        sourceAgency: "NASA",
        hazardType: "wildfire",
        title: "Wildfire",
        location: "Simulated Wildfire (Australia)",
        latitude: -33.8,
        longitude: 151.2,
        severity: "High",
        magnitude: "1200",
        magnitudeUnit: "acres",
        color: "text-orange-300",
        dot: "bg-orange-400",
        verificationStatus: "satellite_detection",
        observedAt: new Date().toISOString()
      }
    ];
  }
}
