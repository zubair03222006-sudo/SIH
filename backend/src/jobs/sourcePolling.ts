import { SourceAdapter } from "../ingestion/sourceAdapter.interface.js";
import { USGSAdapter } from "../ingestion/usgsAdapter.js";
import { EONETAdapter } from "../ingestion/eonetAdapter.js";
import { SACHETAdapter } from "../ingestion/sachetAdapter.js";
import { OpenMeteoAdapter } from "../ingestion/openMeteoAdapter.js";
import { CWCAdapter } from "../ingestion/cwcAdapter.js";
import { IMDAdapter } from "../ingestion/imdAdapter.js";
import { INCOISAdapter } from "../ingestion/incoisAdapter.js";
import { FIRMSIndiaAdapter } from "../ingestion/firmsIndiaAdapter.js";
import { DisasterEvent } from "../types/disaster.js";

export class SourcePollingJob {
  private adapters: SourceAdapter[];
  private events: DisasterEvent[] = [];
  private intervalIds: NodeJS.Timeout[] = [];
  private isPolling = false;

  constructor() {
    this.adapters = [
      new USGSAdapter(),
      new EONETAdapter(),
      new SACHETAdapter(),
      new OpenMeteoAdapter(),
      new CWCAdapter(),
      new IMDAdapter(),
      new INCOISAdapter(),
      new FIRMSIndiaAdapter()
    ];
  }

  public getAdapters(): SourceAdapter[] {
    return this.adapters;
  }

  public getEvents(): DisasterEvent[] {
    return this.events;
  }

  public async fetchAll(): Promise<void> {
    console.log("[SourcePollingJob] Fetching from all adapters...");
    try {
      const results = await Promise.allSettled(this.adapters.map(a => a.fetch()));
      
      const newEvents: DisasterEvent[] = [];
      results.forEach((res, i) => {
        if (res.status === "fulfilled") {
          newEvents.push(...res.value);
        } else {
          console.error(`[SourcePollingJob] Adapter ${this.adapters[i].name} failed:`, res.reason);
        }
      });

      this.events = newEvents;
      console.log(`[SourcePollingJob] Cache updated with ${this.events.length} events.`);
    } catch (err) {
      console.error("[SourcePollingJob] Critical error in fetchAll:", err);
    }
  }

  public start(): void {
    if (this.isPolling) return;
    this.isPolling = true;

    // Initial fetch
    this.fetchAll();

    // Setup polling intervals
    // USGS, EONET, FIRMS every 5 mins
    this.intervalIds.push(setInterval(() => this.pollSpecific(["USGS Earthquakes", "NASA EONET", "NASA FIRMS / Satellite Hotspots (India)"]), 5 * 60 * 1000));
    
    // SACHET, CWC, IMD, INCOIS every 10 mins
    this.intervalIds.push(setInterval(() => this.pollSpecific([
      "SACHET (NDMA India)",
      "CWC (Central Water Commission India)",
      "IMD (India Meteorological Department)",
      "INCOIS (Indian National Centre for Ocean Information Services)"
    ]), 10 * 60 * 1000));
    
    // OpenMeteo every 30 mins
    this.intervalIds.push(setInterval(() => this.pollSpecific(["Open-Meteo Forecast"]), 30 * 60 * 1000));
  }

  public stop(): void {
    this.isPolling = false;
    this.intervalIds.forEach(clearInterval);
    this.intervalIds = [];
  }

  private async pollSpecific(adapterNames: string[]): Promise<void> {
    const targets = this.adapters.filter(a => adapterNames.includes(a.name));
    if (targets.length === 0) return;
    
    console.log(`[SourcePollingJob] Polling specific adapters: ${adapterNames.join(", ")}`);
    
    const results = await Promise.allSettled(targets.map(a => a.fetch()));
    
    // Merge new results with existing events from OTHER adapters
    const otherEvents = this.events.filter(e => !adapterNames.includes(e.source));
    const newEvents: DisasterEvent[] = [];
    
    results.forEach(res => {
      if (res.status === "fulfilled") {
        newEvents.push(...res.value);
      }
    });

    this.events = [...otherEvents, ...newEvents];
  }
}

// Singleton instance
export const pollingService = new SourcePollingJob();
