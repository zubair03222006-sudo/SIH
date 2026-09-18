import * as THREE from "three";

export function latLngToVec3(lat: number, lng: number, radius = 1): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

export function greatCircleCurve(
  start: THREE.Vector3,
  end: THREE.Vector3,
  altitudeFactor = 0.35,
): THREE.CatmullRomCurve3 {
  const points: THREE.Vector3[] = [];
  const segments = 64;
  const startN = start.clone().normalize();
  const endN = end.clone().normalize();
  const angle = startN.angleTo(endN);
  const maxAlt = start.length() * (1 + altitudeFactor * Math.min(1, angle / Math.PI));

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = new THREE.Vector3().lerpVectors(startN, endN, t).normalize();
    const lift = Math.sin(Math.PI * t);
    const r = start.length() + (maxAlt - start.length()) * lift;
    points.push(p.multiplyScalar(r));
  }
  return new THREE.CatmullRomCurve3(points);
}

export type MarkerKind = "critical" | "warning" | "highrisk" | "safe";
export type RouteKind = "rescue" | "evacuation" | "supply" | "airsupport";

export interface Marker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: MarkerKind;
}

export interface Route {
  id: string;
  from: [number, number];
  to: [number, number];
  kind: RouteKind;
  fromName?: string;
  toName?: string;
}

/* ─── Reverse geocoder ───────────────────────────────────────────────────────── */

export const GEO_LOOKUP: Record<string, [number, number]> = {
  Tokyo: [35.68, 139.69],
  Delhi: [28.61, 77.21],
  Mumbai: [19.08, 72.88],
  Shanghai: [31.23, 121.47],
  Beijing: [39.9, 116.4],
  "New York": [40.71, -74.01],
  "Los Angeles": [34.05, -118.24],
  London: [51.51, -0.13],
  Paris: [48.86, 2.35],
  Istanbul: [41.01, 28.98],
  Jakarta: [-6.21, 106.85],
  Dhaka: [23.81, 90.41],
  Cairo: [30.04, 31.24],
  Kathmandu: [27.72, 85.32],
  Sendai: [38.27, 140.87],
  Athens: [37.98, 23.73],
  Lisbon: [38.72, -9.14],
  Nairobi: [-1.29, 36.82],
  Sydney: [-33.87, 151.21],
  "San Francisco": [37.77, -122.42],
  Miami: [25.76, -80.19],
  "Mexico City": [19.43, -99.13],
  Bogota: [4.71, -74.07],
  "São Paulo": [-23.55, -46.63],
  Rome: [41.9, 12.5],
  Berlin: [52.52, 13.41],
  Moscow: [55.76, 37.62],
  Singapore: [1.35, 103.82],
  Seoul: [37.57, 126.98],
  Manila: [14.6, 120.98],
  "Hong Kong": [22.32, 114.17],
  Bangalore: [12.97, 77.59],
  Chennai: [13.08, 80.27],
  Kolkata: [22.57, 88.36],
  Hyderabad: [17.39, 78.49],
  Lahore: [31.55, 74.35],
  Karachi: [24.86, 67.01],
  Tehran: [35.69, 51.39],
  Baghdad: [33.31, 44.37],
  Riyadh: [24.71, 46.67],
  Dubai: [25.2, 55.27],
  Osaka: [34.69, 135.5],
  Taipei: [25.03, 121.57],
  Bangkok: [13.76, 100.5],
  Hanoi: [21.03, 105.85],
  "Kuala Lumpur": [3.14, 101.69],
  Lima: [-12.05, -77.04],
  "Buenos Aires": [-34.6, -58.38],
  Santiago: [-33.45, -70.67],
  Lagos: [6.52, 3.38],
  Accra: [5.56, -0.19],
  "Addis Ababa": [9.03, 38.75],
  "Cape Town": [-33.93, 18.42],
  Amsterdam: [52.37, 4.9],
  Zurich: [47.38, 8.54],
  Toronto: [43.65, -79.38],
  Vancouver: [49.28, -123.12],
  Chicago: [41.88, -87.63],
  Houston: [29.76, -95.37],
  Seattle: [47.61, -122.33],
  Denver: [39.74, -104.99],
  "Central Asia": [43, 75],
  "South China": [28, 108],
  Sahara: [22, 12],
  "Horn of Africa": [9, 40],
  Mozambique: [-18, 35],
  Sahel: [14, 0],
  "Kenya Hub": [-1, 37],
  "Northern Europe": [60, 18],
  Arabia: [24, 45],
  Indonesia: [-2, 118],
};

/** Returns the nearest named location to given lat/lng */
export function nearestCity(lat: number, lng: number): string {
  let closest = "Unknown Location";
  let minDist = Infinity;
  const R = 6371; // Earth radius in km
  const latRad = lat * (Math.PI / 180);

  for (const [city, [clat, clng]] of Object.entries(GEO_LOOKUP)) {
    const clatRad = clat * (Math.PI / 180);
    const dLat = (clat - lat) * (Math.PI / 180);
    const dLng = (clng - lng) * (Math.PI / 180);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(latRad) * Math.cos(clatRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const dist = R * c; // Distance in km

    if (dist < minDist) {
      minDist = dist;
      closest = city;
    }
  }
  return closest;
}

/* ─── Static seed data ───────────────────────────────────────────────────────── */

// Scenario layers start empty. User-created markers/routes are local planning
// annotations and are never presented as live operational assets.
export const MARKERS: Marker[] = [];
export const ROUTES: Route[] = [];

export const KIND_COLORS: Record<MarkerKind, string> = {
  critical: "#ff3344",
  warning: "#ffb347",
  highrisk: "#ff7a3a",
  safe: "#3dffa5",
};

export const ROUTE_COLORS: Record<RouteKind, string> = {
  rescue: "#3dffa5",
  evacuation: "#ff3344",
  supply: "#3ab6ff",
  airsupport: "#cbd5e1",
};
