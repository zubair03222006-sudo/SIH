import { SourceAdapter } from "./sourceAdapter.interface.js";
import { DisasterEvent, SourceHealth, SourceHealthStatus } from "../types/disaster.js";

// Open-Meteo isn't purely a disaster event feed, but we can query it for severe weather
// and convert it into DisasterEvents if thresholds are crossed, or just use it as a 
// forecast enrichment API. This adapter implements the SourceAdapter interface for
// polling severe weather events, but the actual forecast querying will be done separately.

export class OpenMeteoAdapter implements SourceAdapter {
  name = "Open-Meteo Forecast";
  private lastSuccess: Date | null = null;
  private lastError: string | null = null;
  private isDemoFallback = false;

  async fetch(): Promise<DisasterEvent[]> {
    try {
      // For MVP, we'll fetch a daily forecast for a central India point and check for extremes
      // In a real app, this would query a grid or specific cities
      const lat = 21.0;
      const lng = 78.0;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      // Requesting precipitation and wind gusts to find potential storms/floods
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=precipitation_sum,wind_gusts_10m_max&timezone=Asia%2FKolkata&forecast_days=3`;
      
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);
      const data = await res.json();
      
      this.lastSuccess = new Date();
      this.lastError = null;
      this.isDemoFallback = false;

      return this.normalize(data);
    } catch (err: any) {
      this.lastError = err.message;
      this.isDemoFallback = true;
      console.warn("Open-Meteo fetch failed:", err.message);
      return this.getFallbackData();
    }
  }

  normalize(raw: any): DisasterEvent[] {
    const events: DisasterEvent[] = [];
    if (!raw?.daily) return events;

    const { time, precipitation_sum, wind_gusts_10m_max } = raw.daily;

    for (let i = 0; i < time.length; i++) {
      const date = time[i];
      const rain = precipitation_sum[i];
      const wind = wind_gusts_10m_max[i];

      // Thresholds for creating an event
      if (rain > 100) {
        events.push({
          id: `openmeteo-rain-${date}`,
          source: "Open-Meteo",
          sourceAgency: "GFS-derived",
          hazardType: "heavy_rain",
          title: "Model Forecast: Heavy Rain",
          location: "Central India Region",
          latitude: raw.latitude,
          longitude: raw.longitude,
          severity: rain > 200 ? "Critical" : "High",
          magnitude: `${rain}`,
          magnitudeUnit: "mm",
          color: "text-sky-300",
          dot: "bg-sky-400",
          verificationStatus: "ai_estimate",
          issuedAt: new Date().toISOString(),
          validUntil: new Date(date).toISOString(),
          certainty: "possible",
          urgency: "expected"
        });
      }

      if (wind > 90) {
        events.push({
          id: `openmeteo-wind-${date}`,
          source: "Open-Meteo",
          sourceAgency: "GFS-derived",
          hazardType: "storm",
          title: "Model Forecast: Severe Wind Gusts",
          location: "Central India Region",
          latitude: raw.latitude,
          longitude: raw.longitude,
          severity: wind > 120 ? "Critical" : "High",
          magnitude: `${wind}`,
          magnitudeUnit: "km/h",
          color: "text-violet-300",
          dot: "bg-violet-400",
          verificationStatus: "ai_estimate",
          issuedAt: new Date().toISOString(),
          validUntil: new Date(date).toISOString(),
          certainty: "possible",
          urgency: "expected"
        });
      }
    }

    return events;
  }

  validate(event: any): boolean {
    return true;
  }

  getHealth(): SourceHealth {
    let status: SourceHealthStatus = "healthy";
    if (this.isDemoFallback) status = "degraded";
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
    return [];
  }
}
