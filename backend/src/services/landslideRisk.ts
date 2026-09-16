/**
 * Indian Landslide Susceptibility & Terrain Risk Assessment Engine
 * High Risk Belts: Western Ghats, Himachal/Uttarakhand Himalayas, North-East Hills
 */

export interface LandslideRiskAssessment {
  location: string;
  latitude: number;
  longitude: number;
  susceptibilityScore: number; // 0.0 to 1.0
  riskCategory: "Critical" | "High" | "Moderate" | "Low";
  contributingFactors: string[];
  recommendedAction: string;
}

const HIGH_RISK_ZONES = [
  // Western Ghats Belt
  { name: "Wayanad & Vythiri", lat: 11.6854, lon: 76.1320, radiusKm: 35, baseScore: 0.88 },
  { name: "Idukki & Munnar", lat: 9.8500, lon: 77.1667, radiusKm: 40, baseScore: 0.85 },
  { name: "Nilgiris & Coonoor", lat: 11.4064, lon: 76.6932, radiusKm: 30, baseScore: 0.82 },
  { name: "Kodagu / Coorg", lat: 12.4244, lon: 75.7382, radiusKm: 35, baseScore: 0.78 },
  { name: "Mahabaleshwar & Western Ghats Escarpment", lat: 17.9237, lon: 73.6586, radiusKm: 25, baseScore: 0.75 },

  // Himalayan Slope Belt
  { name: "Kedarnath & Mandakini Valley", lat: 30.7346, lon: 79.0669, radiusKm: 30, baseScore: 0.92 },
  { name: "Chamoli & Joshimath", lat: 30.5526, lon: 79.5658, radiusKm: 35, baseScore: 0.90 },
  { name: "Shimla-Kullu Highway Belt", lat: 31.1048, lon: 77.1734, radiusKm: 40, baseScore: 0.80 },
  { name: "Mandi & Beas River Gorge", lat: 31.7084, lon: 76.9319, radiusKm: 25, baseScore: 0.84 },
  { name: "Darjeeling & Teesta Valley", lat: 27.0410, lon: 88.2663, radiusKm: 30, baseScore: 0.86 },
  { name: "Gangtok & East Sikkim Corridor", lat: 27.3389, lon: 88.6065, radiusKm: 35, baseScore: 0.85 },

  // North-East Hill Ranges
  { name: "Guwahati - Shillong NH104 Cut-Slopes", lat: 25.5788, lon: 91.8933, radiusKm: 30, baseScore: 0.76 },
];

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function assessLandslideRisk(
  lat: number,
  lon: number,
  recentRainfallMm: number = 0
): LandslideRiskAssessment {
  let matchedZone = null;
  let minDistance = Infinity;

  for (const zone of HIGH_RISK_ZONES) {
    const d = haversineDistance(lat, lon, zone.lat, zone.lon);
    if (d <= zone.radiusKm && d < minDistance) {
      minDistance = d;
      matchedZone = zone;
    }
  }

  let susceptibilityScore = matchedZone ? matchedZone.baseScore : 0.15;
  const factors: string[] = [];

  if (matchedZone) {
    factors.push(`Located in documented high-susceptibility zone (${matchedZone.name})`);
  }

  // Rainfall acceleration threshold: >100mm/24h triggers severe pore water pressure buildup
  if (recentRainfallMm > 150) {
    susceptibilityScore = Math.min(1.0, susceptibilityScore + 0.35);
    factors.push(`Extremely high 24-hr cumulative rainfall (${recentRainfallMm}mm) exceeding soil saturation threshold`);
  } else if (recentRainfallMm > 80) {
    susceptibilityScore = Math.min(1.0, susceptibilityScore + 0.20);
    factors.push(`Heavy continuous rainfall (${recentRainfallMm}mm) increasing pore water pressure`);
  }

  let riskCategory: "Critical" | "High" | "Moderate" | "Low" = "Low";
  let recommendedAction = "Normal monitoring. Keep drainage channels clear.";

  if (susceptibilityScore >= 0.8) {
    riskCategory = "Critical";
    recommendedAction = "IMMEDIATE EVACUATION: High probability of debris flow or slope failure. Evacuate cut-slope habitations.";
  } else if (susceptibilityScore >= 0.6) {
    riskCategory = "High";
    recommendedAction = "HIGH WATCH: Restrict vehicular movement on hill roads during night. Monitor tension cracks.";
  } else if (susceptibilityScore >= 0.4) {
    riskCategory = "Moderate";
    recommendedAction = "MODERATE WATCH: Stay alert near steep road cuts and seasonal streams.";
  }

  return {
    location: matchedZone ? matchedZone.name : `Lat ${lat.toFixed(3)}, Lon ${lon.toFixed(3)}`,
    latitude: lat,
    longitude: lon,
    susceptibilityScore: parseFloat(susceptibilityScore.toFixed(2)),
    riskCategory,
    contributingFactors: factors,
    recommendedAction
  };
}
