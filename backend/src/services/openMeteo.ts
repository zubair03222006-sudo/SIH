/**
 * Open-Meteo Weather Service
 * Free weather API — no API key required.
 * Provides geocoding, current conditions, and 7-day forecasts.
 */

// ── Weather code descriptions (WMO code table) ──────────────────────────────
const WMO_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snowfall",
  73: "Moderate snowfall",
  75: "Heavy snowfall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

function describeWeatherCode(code: number): string {
  return WMO_CODES[code] ?? `Unknown (code ${code})`;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface GeoLocation {
  lat: number;
  lng: number;
  name: string;
  admin1?: string; // state/province
  country?: string;
}

export interface CurrentWeather {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  precipitation: number;
  weatherDescription: string;
  weatherCode: number;
  windSpeed: number;
  windDirection: number;
}

export interface DailyForecast {
  date: string;
  tempMax: number;
  tempMin: number;
  precipSum: number;
  precipProbability: number;
  weatherDescription: string;
  windSpeedMax: number;
}

export interface WeatherData {
  location: GeoLocation;
  current: CurrentWeather;
  daily: DailyForecast[];
  fetchedAt: string;
}

// ── Geocoding ────────────────────────────────────────────────────────────────

export async function geocodeLocation(name: string): Promise<GeoLocation | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const result = data.results?.[0];
    if (!result) return null;

    return {
      lat: result.latitude,
      lng: result.longitude,
      name: result.name,
      admin1: result.admin1,
      country: result.country,
    };
  } catch (err) {
    console.error("[OpenMeteo] Geocoding error:", err);
    return null;
  }
}

// ── Weather Fetch ────────────────────────────────────────────────────────────

export async function fetchWeather(lat: number, lng: number): Promise<Omit<WeatherData, "location"> | null> {
  try {
    const currentVars = [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "precipitation",
      "weather_code",
      "wind_speed_10m",
      "wind_direction_10m",
    ].join(",");

    const dailyVars = [
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "precipitation_probability_max",
      "weather_code",
      "wind_speed_10m_max",
    ].join(",");

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=${currentVars}&daily=${dailyVars}&timezone=auto&forecast_days=7`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();

    const current: CurrentWeather = {
      temperature: data.current.temperature_2m,
      apparentTemperature: data.current.apparent_temperature,
      humidity: data.current.relative_humidity_2m,
      precipitation: data.current.precipitation,
      weatherCode: data.current.weather_code,
      weatherDescription: describeWeatherCode(data.current.weather_code),
      windSpeed: data.current.wind_speed_10m,
      windDirection: data.current.wind_direction_10m,
    };

    const daily: DailyForecast[] = data.daily.time.map((date: string, i: number) => ({
      date,
      tempMax: data.daily.temperature_2m_max[i],
      tempMin: data.daily.temperature_2m_min[i],
      precipSum: data.daily.precipitation_sum[i],
      precipProbability: data.daily.precipitation_probability_max[i],
      weatherDescription: describeWeatherCode(data.daily.weather_code[i]),
      windSpeedMax: data.daily.wind_speed_10m_max[i],
    }));

    return { current, daily, fetchedAt: new Date().toISOString() };
  } catch (err) {
    console.error("[OpenMeteo] Weather fetch error:", err);
    return null;
  }
}

// ── Combined lookup (name → geocode → weather) ──────────────────────────────

export async function getWeatherByLocation(locationName: string): Promise<WeatherData | null> {
  const geo = await geocodeLocation(locationName);
  if (!geo) return null;

  const weather = await fetchWeather(geo.lat, geo.lng);
  if (!weather) return null;

  return { location: geo, ...weather };
}

export async function getWeatherByCoords(lat: number, lng: number, name?: string): Promise<WeatherData | null> {
  const weather = await fetchWeather(lat, lng);
  if (!weather) return null;

  const location: GeoLocation = { lat, lng, name: name ?? `${lat.toFixed(2)}, ${lng.toFixed(2)}` };
  return { location, ...weather };
}

// ── Format for LLM context ──────────────────────────────────────────────────

export function formatWeatherForLLM(data: WeatherData): string {
  const loc = data.location;
  const locLabel = [loc.name, loc.admin1, loc.country].filter(Boolean).join(", ");
  const c = data.current;

  let text = `=== LIVE WEATHER DATA: ${locLabel} (${loc.lat.toFixed(2)}°N, ${loc.lng.toFixed(2)}°E) ===\n`;
  text += `Fetched: ${data.fetchedAt}\n\n`;

  text += `CURRENT CONDITIONS:\n`;
  text += `  Temperature: ${c.temperature}°C (feels like ${c.apparentTemperature}°C)\n`;
  text += `  Humidity: ${c.humidity}%\n`;
  text += `  Conditions: ${c.weatherDescription}\n`;
  text += `  Precipitation: ${c.precipitation} mm\n`;
  text += `  Wind: ${c.windSpeed} km/h (direction ${c.windDirection}°)\n\n`;

  text += `7-DAY FORECAST:\n`;
  for (const day of data.daily) {
    const dayName = new Date(day.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    text += `  ${dayName}: ${day.tempMin}°C – ${day.tempMax}°C | ${day.weatherDescription}`;
    text += ` | Rain: ${day.precipSum}mm (${day.precipProbability}% chance)`;
    text += ` | Wind: ${day.windSpeedMax} km/h\n`;
  }

  return text;
}
