import { SourceAdapter } from "./sourceAdapter.interface.js";
import { DisasterEvent, SourceHealth } from "../types/disaster.js";

/**
 * MVP PLACEHOLDER: WRF (Weather Research and Forecasting) Model Adapter
 * 
 * WRF is a regional numerical weather-prediction model that requires a separate compute pipeline, 
 * initial and boundary conditions, terrain data, configuration, storage, and significant processing.
 * 
 * As per MVP specifications, WRF is not run in this version. This is an interface stub for future
 * implementation where WRF output (e.g. converted to GeoJSON or queried via a specialized API) 
 * would be ingested into the Sentinel platform.
 */
export class WRFRegionalForecastAdapter implements SourceAdapter {
  name = "WRF Regional Forecast";

  async fetch(): Promise<DisasterEvent[]> {
    // Stub: In the future, this would fetch from a WRF output processing service
    return [];
  }

  normalize(raw: unknown): DisasterEvent[] {
    return [];
  }

  validate(event: DisasterEvent): boolean {
    return false;
  }

  getHealth(): SourceHealth {
    return {
      name: this.name,
      status: "offline",
      lastSuccess: null,
      lastError: "Not implemented in MVP",
      isDemoFallback: false,
      message: "WRF model processing is disabled in the MVP version."
    };
  }

  getLastSuccess(): Date | null {
    return null;
  }

  getFallbackData(): DisasterEvent[] {
    return [];
  }
}
