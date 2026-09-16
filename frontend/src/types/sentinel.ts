export type HazardType =
  | "earthquake"
  | "heavy_rain"
  | "flood"
  | "landslide"
  | "cyclone"
  | "wildfire"
  | "lightning"
  | "thunderstorm"
  | "tsunami"
  | "heatwave"
  | "avalanche"
  | "storm"
  | "volcano"
  | "other";

export type VerificationStatus =
  | "official_warning"
  | "official_observation"
  | "satellite_detection"
  | "historical_risk"
  | "ai_estimate"
  | "field_report"
  | "mapped_facility"
  | "verified_facility";

export type Severity = "Critical" | "High" | "Warning" | "Info";

export interface DisasterEvent {
  id: string;
  source: string;
  sourceAgency?: string;
  sourceUrl?: string;
  sourceEventId?: string;
  hazardType: HazardType;
  title: string;
  /** Human-readable display string (e.g. "12km N of Kathmandu, Nepal") */
  location: string;
  description?: string;
  latitude: number;
  longitude: number;
  geometry?: unknown;
  state?: string;
  district?: string;
  severity: Severity;
  urgency?: "past" | "expected" | "immediate";
  certainty?: "observed" | "likely" | "possible";
  verificationStatus?: VerificationStatus;
  issuedAt?: string;
  observedAt?: string;
  validUntil?: string;
  instructions?: string[];
  affectedPopulation?: number;
  confidence?: number;
  dataFreshnessMinutes?: number;
  rawPayload?: unknown;

  // UI display fields
  color?: string;
  dot?: string;
  magnitude?: string;
  magnitudeUnit?: string;
  /** Legacy fields used by existing frontend components */
  detected?: string;
  affected?: string;
  coords: [number, number];
}

/** Alias for backward compatibility with existing frontend components */
export type LiveEvent = DisasterEvent;

export type SourceHealthStatus = "healthy" | "degraded" | "offline";

export interface SourceHealth {
  name: string;
  status: SourceHealthStatus;
  lastSuccess: Date | null;
  lastError: string | null;
  message?: string;
  isDemoFallback: boolean;
}
