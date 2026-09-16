import { SourceAdapter } from "./sourceAdapter.interface.js";
import { DisasterEvent, SourceHealth, SourceHealthStatus } from "../types/disaster.js";

function getEqSeverityAndColor(mag: number) {
  if (mag >= 7.0) return { severity: "Critical" as const, color: "text-rose-300", dot: "bg-rose-400" };
  if (mag >= 6.0) return { severity: "High" as const, color: "text-amber-300", dot: "bg-amber-400" };
  if (mag >= 5.0) return { severity: "Warning" as const, color: "text-sky-300", dot: "bg-sky-400" };
  return { severity: "Info" as const, color: "text-slate-300", dot: "bg-slate-400" };
}

function formatTimeAgo(time: number): string {
  const diffInMinutes = Math.floor((Date.now() - time) / 60000);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  return `${Math.floor(diffInHours / 24)}d ago`;
}

export class USGSAdapter implements SourceAdapter {
  name = "USGS Earthquakes";
  private lastSuccess: Date | null = null;
  private lastError: string | null = null;
  private isDemoFallback = false;

  async fetch(): Promise<DisasterEvent[]> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson", {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!res.ok) throw new Error(`USGS returned ${res.status}`);
      const data = await res.json();
      
      this.lastSuccess = new Date();
      this.lastError = null;
      this.isDemoFallback = false;
      
      return this.normalize(data);
    } catch (err: any) {
      this.lastError = err.message;
      this.isDemoFallback = true;
      console.error("USGS fetch failed, using fallback:", err);
      return this.getFallbackData();
    }
  }

  normalize(raw: any): DisasterEvent[] {
    if (!raw?.features) return [];
    
    return raw.features.map((feature: any): DisasterEvent | null => {
      if (!this.validate(feature)) return null;
      
      const mag = feature.properties.mag ?? 4.5;
      const { severity, color, dot } = getEqSeverityAndColor(mag);
      
      return {
        id: feature.id,
        source: "USGS",
        sourceAgency: "USGS",
        sourceUrl: feature.properties.url,
        hazardType: "earthquake",
        title: "Earthquake",
        location: feature.properties.place ?? "Unknown",
        latitude: feature.geometry.coordinates[1],
        longitude: feature.geometry.coordinates[0],
        severity,
        magnitude: `${mag.toFixed(1)}`,
        magnitudeUnit: "Mw",
        color,
        dot,
        verificationStatus: "official_observation",
        issuedAt: new Date(feature.properties.time).toISOString(),
        observedAt: new Date(feature.properties.time).toISOString(),
        dataFreshnessMinutes: Math.floor((Date.now() - feature.properties.time) / 60000),
        rawPayload: feature
      };
    }).filter(Boolean) as DisasterEvent[];
  }

  validate(feature: any): boolean {
    if (!feature || !feature.geometry || !feature.properties) return false;
    const coords = feature.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return false;
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
    // Seed some demo earthquake data to ensure UI always has something to render if offline
    return [
      {
        id: "usgs-demo-1",
        source: "USGS",
        sourceAgency: "USGS",
        hazardType: "earthquake",
        title: "Earthquake",
        location: "12km N of Kathmandu, Nepal",
        latitude: 27.7,
        longitude: 85.3,
        severity: "Warning",
        magnitude: "5.1",
        magnitudeUnit: "Mw",
        color: "text-sky-300",
        dot: "bg-sky-400",
        verificationStatus: "official_observation",
        issuedAt: new Date(Date.now() - 3600000).toISOString()
      }
    ];
  }
}
