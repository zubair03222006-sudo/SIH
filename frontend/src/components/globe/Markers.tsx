import { useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import {
  Home,
  CloudRain,
  CloudLightning,
  Zap,
  Wind,
  Flame,
  Mountain,
  Activity,
  Sun,
  Waves,
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { latLngToVec3, KIND_COLORS } from "./geo";
import { useEventsStore } from "../../hooks/useEventsStore";
import { useMarkersStore } from "../../hooks/useMarkersStore";
import { useSelectionStore } from "../../hooks/useSelectionStore";
import { LiveEvent } from "../../lib/api/live-data";
import type { Marker } from "../../hooks/useMarkersStore";

/* ─── Hazard Icon Renderer ─────────────────────────────────────────────────── */

function HazardIcon({ hazardType }: { hazardType: string }) {
  const props = { className: "w-2 h-2 stroke-[3]" };
  switch (hazardType) {
    case "flood":
      return <Home {...props} />;
    case "heavy_rain":
      return <CloudRain {...props} />;
    case "thunderstorm":
    case "lightning":
      return <CloudLightning {...props} />;
    case "cyclone":
      return <RefreshCw {...props} />;
    case "wildfire":
      return <Flame {...props} />;
    case "landslide":
      return <Mountain {...props} />;
    case "earthquake":
      return <Activity {...props} />;
    case "heatwave":
      return <Sun {...props} />;
    case "tsunami":
      return <Waves {...props} />;
    case "storm":
      return <Wind {...props} />;
    default:
      return <ShieldAlert {...props} />;
  }
}

/* ─── Disaster Event Badge Marker ──────────────────────────────────────────── */

// Pre-allocated vector reusable objects to avoid per-frame GC allocations
const _tempNormal = new THREE.Vector3();
const _tempToCam = new THREE.Vector3();

function DisasterBadgeMarker({
  event,
  coords,
  radius,
  isSelected,
  onToggle,
}: {
  event: LiveEvent;
  coords: [number, number];
  radius: number;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(true);
  const { camera } = useThree();
  const pos = latLngToVec3(coords[0], coords[1], radius * 1.015);
  const posVec = pos;

  // Efficient per-frame front-face visibility check without garbage collection or Raycaster overhead
  useFrame(() => {
    _tempNormal.copy(posVec).normalize();
    _tempToCam.copy(camera.position).sub(posVec).normalize();
    const isFront = _tempNormal.dot(_tempToCam) > 0.05;
    if (visible !== isFront) {
      setVisible(isFront);
    }
  });

  const isCritical = event.severity === "Critical";
  const isHigh = event.severity === "High";

  // Color scheme matching user reference image
  let bgGradient = "from-yellow-400 via-amber-400 to-yellow-500 text-slate-950";
  let ringColor = "ring-amber-400/40";
  let shadowGlow = "shadow-[0_0_6px_rgba(250,204,21,0.5)]";

  if (isCritical) {
    bgGradient = "from-red-500 via-rose-600 to-red-600 text-white";
    ringColor = "ring-red-500/60";
    shadowGlow = "shadow-[0_0_8px_rgba(239,68,68,0.65)]";
  } else if (isHigh) {
    bgGradient = "from-orange-400 via-amber-500 to-orange-500 text-slate-950";
    ringColor = "ring-orange-500/50";
    shadowGlow = "shadow-[0_0_7px_rgba(249,115,22,0.6)]";
  }

  if (!visible) return null;

  return (
    <group position={pos}>
      <Html center distanceFactor={3} className="pointer-events-auto select-none">
        <div className="relative flex flex-col items-center">
          {/* Minimal dot-pin marker */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className={`
              relative flex items-center justify-center
              w-3 h-3 rounded-full bg-gradient-to-br ${bgGradient}
              border border-white/70 ${shadowGlow}
              transition-transform duration-150 ease-out
              hover:scale-125 cursor-pointer
              ${isSelected ? "scale-125 ring-1 ring-white z-50" : ""}
            `}
            title={event.title}
          >
            <HazardIcon hazardType={event.hazardType} />
          </button>

          {/* Hover Info Tooltip (hide if selected to avoid double panel) */}
          {hovered && !isSelected && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-50 w-48 p-2 rounded-xl bg-slate-950/90 backdrop-blur-md border border-white/20 text-white shadow-2xl pointer-events-none text-left">
              <div className="flex items-center gap-1.5 mb-1">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${event.dot || (isCritical ? "bg-red-500" : "bg-amber-400")}`}
                />
                <span className="text-[9px] font-bold uppercase tracking-wider text-white/70">
                  {event.sourceAgency || event.source}
                </span>
                <span className="ml-auto text-[8px] px-1 py-0.5 rounded font-semibold bg-white/10">
                  {event.severity}
                </span>
              </div>
              <div className="text-[11px] font-bold leading-tight line-clamp-2 text-white">
                {event.title}
              </div>
              <div className="text-[9px] text-white/60 mt-1 truncate">📍 {event.location}</div>
              {event.magnitude && (
                <div className="text-[9px] text-amber-300 font-medium mt-0.5">
                  ⚡ {event.magnitude} {event.magnitudeUnit || ""}
                </div>
              )}
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}

/* ─── Geo location pin ───────────────────────────────────────────────────────── */

function GeoPin({
  marker,
  radius,
  isSelected,
  onToggle,
}: {
  marker: Marker;
  radius: number;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const pos = latLngToVec3(marker.lat, marker.lng, radius * 1.007);
  const color = KIND_COLORS[marker.kind] ?? "#94a3b8";

  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (ref.current) {
      const p = 1 + Math.sin(clock.elapsedTime * 1.2 + marker.lat) * 0.08;
      ref.current.scale.setScalar(p);
    }
  });

  return (
    <group>
      <mesh ref={ref} position={pos}>
        <octahedronGeometry args={[0.016, 0]} />
        <meshBasicMaterial color={isSelected ? "#ffffff" : color} toneMapped={false} />
      </mesh>
      <mesh position={pos}>
        <sphereGeometry args={[isSelected ? 0.04 : 0.028, 12, 12]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isSelected ? 0.5 : 0.18}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <mesh
        position={pos}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "default")}
      >
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ─── Combined Markers Component ─────────────────────────────────────────────── */

export function Markers({ radius }: { radius: number }) {
  const { events } = useEventsStore();
  const { markers } = useMarkersStore();
  const { selected, toggleSelect } = useSelectionStore();

  return (
    <group>
      {events.map((e) => {
        const coords: [number, number] = [
          e.coords?.[0] ?? e.latitude,
          e.coords?.[1] ?? e.longitude,
        ];
        return (
          <DisasterBadgeMarker
            key={e.id}
            event={e}
            coords={coords}
            radius={radius}
            isSelected={selected?.type === "event" && selected.id === e.id}
            onToggle={() => toggleSelect({ type: "event", id: e.id })}
          />
        );
      })}

      {markers.map((m) => (
        <GeoPin
          key={m.id}
          marker={m}
          radius={radius}
          isSelected={selected?.type === "geoMarker" && selected.id === m.id}
          onToggle={() => toggleSelect({ type: "geoMarker", id: m.id })}
        />
      ))}
    </group>
  );
}
