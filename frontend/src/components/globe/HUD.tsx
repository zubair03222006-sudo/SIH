import { AlertTriangle, Flame, Shield, Plus, Minus, RotateCw, Navigation } from "lucide-react";
import { useEventsStore } from "../../hooks/useEventsStore";
import { useMarkersStore } from "../../hooks/useMarkersStore";
import { useSelectionStore } from "../../hooks/useSelectionStore";

const legend = [
  {
    icon: (
      <span
        className="h-2 w-2 rounded-full bg-[#ff3344]"
        style={{ boxShadow: "0 0 8px #ff3344" }}
      />
    ),
    label: "CRITICAL",
  },
  { icon: <Flame className="h-3 w-3 text-[#ff7a3a]" />, label: "HIGH RISK" },
  { icon: <AlertTriangle className="h-3 w-3 text-[#ffb347]" />, label: "WARNING" },
  { icon: <Shield className="h-3 w-3 text-[#3dffa5]" />, label: "SAFE" },
];

const routesLegend = [
  { color: "#3dffa5", label: "RESCUE" },
  { color: "#ff3344", label: "EVAC" },
  { color: "#3ab6ff", label: "SUPPLY" },
  { color: "#cbd5e1", label: "AIR" },
];

export function HUD() {
  const { events } = useEventsStore();
  const { markers } = useMarkersStore();
  const { selected } = useSelectionStore();

  // Calculate dynamic coordinates label based on selection
  let latLngText = "LAT 00.00 · LNG 00.00";
  if (selected) {
    if (selected.type === "event") {
      const ev = events.find((e) => e.id === selected.id);
      if (ev) {
        const lat = ev.coords[0];
        const lng = ev.coords[1];
        latLngText = `LAT ${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"} · LNG ${Math.abs(lng).toFixed(3)}°${lng >= 0 ? "E" : "W"}`;
      }
    } else if (selected.type === "geoMarker") {
      const mk = markers.find((m) => m.id === selected.id);
      if (mk) {
        latLngText = `LAT ${Math.abs(mk.lat).toFixed(3)}°${mk.lat >= 0 ? "N" : "S"} · LNG ${Math.abs(mk.lng).toFixed(3)}°${mk.lng >= 0 ? "E" : "W"}`;
      }
    }
  } else if (events.length > 0) {
    // Default to the first event's coordinates if no active selection
    const lat = events[0].coords[0];
    const lng = events[0].coords[1];
    latLngText = `LAT ${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"} · LNG ${Math.abs(lng).toFixed(3)}°${lng >= 0 ? "E" : "W"}`;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] font-mono text-[10px] tracking-[0.18em] text-foreground/90 max-sm:hidden">
      {/* Top bar — subtle glass overlay text */}
      <div className="absolute left-0 right-0 top-0 flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <div
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3dffa5]"
            style={{ boxShadow: "0 0 10px #3dffa5" }}
          />
          <span className="text-foreground/40 text-[9px]">WEATHERGPT // VERIFIED SOURCES ONLY</span>
        </div>
        <div className="flex items-center gap-5 text-foreground/30 text-[9px]">
          <span>SECTOR 07-A</span>
          <span className="tabular-nums">{latLngText}</span>
          <span className="text-emerald-400/50">DEMO ALERTS OFF</span>
        </div>
      </div>

      {/* Corner brackets — thinner, subtler */}
      {[
        "left-3 top-10 border-l border-t",
        "right-3 top-10 border-r border-t",
        "left-3 bottom-10 border-l border-b",
        "right-3 bottom-10 border-r border-b",
      ].map((c, i) => (
        <div key={i} className={`absolute h-5 w-5 border-foreground/15 ${c}`} />
      ))}

      {/* Right controls — glass control pod */}
      <div className="pointer-events-auto absolute right-5 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2.5">
        <div className="glass-chip flex h-11 w-11 items-center justify-center !rounded-full">
          <Navigation className="h-4 w-4 text-[#3dffa5]/80" />
        </div>
        <div className="glass-chip flex flex-col overflow-hidden !rounded-2xl">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("globe-zoom", { detail: -0.25 }))}
            className="p-2 hover:bg-white/[0.06] transition-colors"
            aria-label="Zoom In"
          >
            <Plus className="h-3 w-3 text-white/50" />
          </button>
          <div className="h-px bg-white/[0.06]" />
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("globe-zoom", { detail: 0.25 }))}
            className="p-2 hover:bg-white/[0.06] transition-colors"
            aria-label="Zoom Out"
          >
            <Minus className="h-3 w-3 text-white/50" />
          </button>
          <div className="h-px bg-white/[0.06]" />
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("globe-rotate"))}
            className="p-2 hover:bg-white/[0.06] transition-colors"
            aria-label="Rotate Globe"
          >
            <RotateCw className="h-3 w-3 text-white/50" />
          </button>
        </div>
      </div>

      {/* Bottom legend — compact floating glass bar */}
      <div className="absolute inset-x-5 bottom-5 space-y-2">
        <div className="glass-chip flex flex-wrap items-center gap-4 px-4 py-2.5 !rounded-2xl">
          <span className="text-foreground/25 text-[8px] font-semibold tracking-wider">LEGEND</span>
          {legend.map((l) => (
            <div key={l.label} className="flex items-center gap-1.5 text-foreground/60 text-[9px]">
              {l.icon}
              <span>{l.label}</span>
            </div>
          ))}
          <div className="h-3 w-px bg-foreground/[0.06]" />
          {routesLegend.map((r) => (
            <div key={r.label} className="flex items-center gap-1.5 text-foreground/60 text-[9px]">
              <span
                className="h-0.5 w-4 rounded-full"
                style={{ background: r.color, boxShadow: `0 0 6px ${r.color}` }}
              />
              <span>{r.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
