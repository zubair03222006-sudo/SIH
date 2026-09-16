import { DisasterEvent, SourceHealth } from "../types/disaster.js";

export interface SourceAdapter {
  name: string;
  fetch(): Promise<DisasterEvent[]>;
  normalize(raw: unknown): DisasterEvent[];
  validate(event: DisasterEvent): boolean;
  getHealth(): SourceHealth;
  getLastSuccess(): Date | null;
  getFallbackData(): DisasterEvent[];
}
