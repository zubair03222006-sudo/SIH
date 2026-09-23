import { SourceAdapter } from "./sourceAdapter.interface.js";
import { DisasterEvent, HazardType, Severity, SourceHealth, SourceHealthStatus } from "../types/disaster.js";

/** Shape returned by NDMA's public, live SACHET alert endpoint. */
interface SachetAlert {
  identifier?: string | number;
  severity?: string;
  severity_color?: string;
  severity_level?: string;
  disaster_type?: string;
  area_description?: string;
  warning_message?: string;
  effective_start_time?: string;
  effective_end_time?: string;
  centroid?: string;
  alert_source?: string;
  actual_lang?: string;
  area_covered?: string | number;
}

const SACHET_FEED_URL = "https://sachet.ndma.gov.in/cap_public_website/FetchAllAlertDetails";

export class SACHETAdapter implements SourceAdapter {
  name = "SACHET (NDMA India)";
  private lastSuccess: Date | null = null;
  private lastError: string | null = null;
  private isDemoFallback = false;

  async fetch(): Promise<DisasterEvent[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12_000);

    try {
      const response = await fetch(SACHET_FEED_URL, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`SACHET returned HTTP ${response.status}`);

      const payload: unknown = await response.json();
      const events = this.normalize(payload);
      // An empty, successful feed means NDMA has no active alerts.
      this.lastSuccess = new Date();
      this.lastError = null;
      this.isDemoFallback = false;
      return events;
    } catch (error: unknown) {
      this.lastError = error instanceof Error ? error.message : "Unknown SACHET fetch error";
      this.isDemoFallback = true;
      console.warn("SACHET live feed unavailable:", this.lastError);
      return this.getFallbackData();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  normalize(raw: unknown): DisasterEvent[] {
    const alerts = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)
        ? (raw as { data: unknown[] }).data
        : [];

    return alerts
      .map((alert) => this.toEvent(alert as SachetAlert))
      .filter((event): event is DisasterEvent => event !== null);
  }

  private toEvent(alert: SachetAlert): DisasterEvent | null {
    const [longitude, latitude] = this.parseCentroid(alert.centroid);
    if (latitude === null || longitude === null) return null;

    const severity = this.mapSeverity(alert.severity, alert.severity_color);
    const location = alert.area_description?.trim() || "India";
    const id = String(alert.identifier ?? `${alert.disaster_type}-${location}-${alert.effective_start_time}`);
    const event: DisasterEvent = {
      id: `sachet-${id}`,
      source: "SACHET",
      sourceAgency: "NDMA",
      sourceUrl: SACHET_FEED_URL,
      sourceEventId: String(alert.identifier ?? id),
      hazardType: this.mapHazard(alert.disaster_type),
      title: alert.disaster_type?.trim() || "NDMA hazard alert",
      location,
      description: alert.warning_message?.trim(),
      latitude,
      longitude,
      severity,
      urgency: severity === "Critical" || severity === "High" ? "immediate" : "expected",
      certainty: this.mapCertainty(alert.severity_level),
      verificationStatus: "official_warning",
      issuedAt: this.parseSachetDate(alert.effective_start_time),
      validUntil: this.parseSachetDate(alert.effective_end_time),
      confidence: 1,
      rawPayload: alert,
      color: this.textColor(severity),
      dot: this.dotColor(severity),
    };

    return this.validate(event) ? event : null;
  }

  private parseCentroid(value: string | undefined): [number | null, number | null] {
    const [longitude, latitude] = (value ?? "").split(",").map(Number);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return [null, null];
    return [longitude, latitude]; // SACHET publishes longitude,latitude.
  }

  private parseSachetDate(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const parsed = Date.parse(value.replace(" IST ", " GMT+0530 "));
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
  }

  private mapHazard(type: string | undefined): HazardType {
    const value = (type ?? "").toLowerCase();
    if (value.includes("flood")) return "flood";
    if (value.includes("landslide")) return "landslide";
    if (value.includes("cyclone")) return "cyclone";
    if (value.includes("tsunami")) return "tsunami";
    if (value.includes("avalanche")) return "avalanche";
    if (value.includes("heat")) return "heatwave";
    if (value.includes("fire")) return "wildfire";
    if (value.includes("lightning")) return "lightning";
    if (value.includes("thunder") || value.includes("squall") || value.includes("wind")) return "thunderstorm";
    if (value.includes("rain")) return "heavy_rain";
    if (value.includes("earthquake")) return "earthquake";
    return "other";
  }

  private mapSeverity(level: string | undefined, color: string | undefined): Severity {
    const value = `${level ?? ""} ${color ?? ""}`.toLowerCase();
    if (value.includes("warning") || value.includes("red")) return "Critical";
    if (value.includes("alert") || value.includes("orange")) return "High";
    if (value.includes("watch") || value.includes("yellow")) return "Warning";
    return "Info";
  }

  private mapCertainty(value: string | undefined): "observed" | "likely" | "possible" {
    return (value ?? "").toLowerCase().includes("likely") ? "likely" : "possible";
  }

  private textColor(severity: Severity): string {
    return { Critical: "text-red-400", High: "text-orange-400", Warning: "text-amber-400", Info: "text-sky-400" }[severity];
  }

  private dotColor(severity: Severity): string {
    return { Critical: "bg-red-500", High: "bg-orange-500", Warning: "bg-amber-500", Info: "bg-sky-500" }[severity];
  }

  validate(event: DisasterEvent): boolean {
    return Number.isFinite(event.latitude) && Number.isFinite(event.longitude)
      && event.latitude >= -90 && event.latitude <= 90
      && event.longitude >= -180 && event.longitude <= 180
      && Boolean(event.id) && Boolean(event.title);
  }

  getHealth(): SourceHealth {
    const status: SourceHealthStatus = this.isDemoFallback ? "degraded" : "healthy";
    return {
      name: this.name,
      status,
      lastSuccess: this.lastSuccess,
      lastError: this.lastError,
      isDemoFallback: this.isDemoFallback,
      message: this.isDemoFallback ? "Live SACHET feed is unavailable; demo records are suppressed by default." : "Live NDMA SACHET alerts are being ingested.",
    };
  }

  getLastSuccess(): Date | null {
    return this.lastSuccess;
  }

  // Kept only to satisfy the shared adapter contract; no synthetic alerts are emitted.
  getFallbackData(): DisasterEvent[] {
    return [];
  }
}
