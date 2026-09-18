/** Open-Meteo weather access with explicit NOAA GFS provenance. */

const WMO_CODES: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Depositing rime fog", 51: "Light drizzle", 53: "Moderate drizzle",
  55: "Dense drizzle", 61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
  71: "Slight snowfall", 73: "Moderate snowfall", 75: "Heavy snowfall",
  80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
  95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
};

export type ForecastModel = "gfs" | "best_match";
export interface ProviderMetadata {
  provider: string; model: string; access: string; endpoint: string; retrievedAt: string;
}
export interface GeoLocation {
  lat: number; lng: number; name: string; admin1?: string; country?: string;
}
export interface CurrentWeather {
  time: string; temperature: number; apparentTemperature: number; humidity: number;
  precipitation: number; weatherDescription: string; weatherCode: number;
  windSpeed: number; windGust: number; windDirection: number; visibility: number | null;
}
export interface HourlyForecast extends CurrentWeather { precipitationProbability: number; }
export interface DailyForecast {
  date: string; tempMax: number; tempMin: number; precipSum: number;
  precipProbability: number; weatherDescription: string; windSpeedMax: number; windGustMax: number;
}
export interface WeatherData {
  location: GeoLocation; timezone: string; utcOffsetSeconds: number;
  current: CurrentWeather; hourly: HourlyForecast[]; daily: DailyForecast[];
  provider: ProviderMetadata; fetchedAt: string;
}

function describeWeatherCode(code: number): string {
  return WMO_CODES[code] ?? `Unknown weather code ${code}`;
}

async function fetchJson(url: string, attempts = 2): Promise<any | null> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        if (response.status >= 500 && attempt < attempts) continue;
        return null;
      }
      return await response.json();
    } catch (error) {
      if (attempt === attempts) {
        console.error("[OpenMeteo] Request failed:", error);
        return null;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
  return null;
}

export async function geocodeLocation(name: string): Promise<GeoLocation | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&countryCode=IN`;
  const result = (await fetchJson(url))?.results?.[0];
  if (!result) return null;
  return { lat: result.latitude, lng: result.longitude, name: result.name, admin1: result.admin1, country: result.country };
}

export async function fetchWeather(
  lat: number,
  lng: number,
  model: ForecastModel = "gfs",
): Promise<Omit<WeatherData, "location"> | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const endpoint = model === "gfs"
    ? "https://api.open-meteo.com/v1/gfs"
    : "https://api.open-meteo.com/v1/forecast";
  const currentVars = "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,visibility";
  const hourlyVars = "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,visibility";
  const dailyVars = "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code,wind_speed_10m_max,wind_gusts_10m_max";
  const url = `${endpoint}?latitude=${lat}&longitude=${lng}&current=${currentVars}&hourly=${hourlyVars}&daily=${dailyVars}&timezone=auto&forecast_days=7`;
  const data = await fetchJson(url);
  if (!data?.current || !data?.hourly?.time || !data?.daily?.time) return null;

  const current: CurrentWeather = {
    time: data.current.time,
    temperature: data.current.temperature_2m,
    apparentTemperature: data.current.apparent_temperature,
    humidity: data.current.relative_humidity_2m,
    precipitation: data.current.precipitation,
    weatherCode: data.current.weather_code,
    weatherDescription: describeWeatherCode(data.current.weather_code),
    windSpeed: data.current.wind_speed_10m,
    windGust: data.current.wind_gusts_10m,
    windDirection: data.current.wind_direction_10m,
    visibility: data.current.visibility ?? null,
  };

  const hourly: HourlyForecast[] = data.hourly.time.map((time: string, index: number) => ({
    time,
    temperature: data.hourly.temperature_2m[index],
    apparentTemperature: data.hourly.apparent_temperature[index],
    humidity: data.hourly.relative_humidity_2m[index],
    precipitation: data.hourly.precipitation[index],
    precipitationProbability: data.hourly.precipitation_probability[index],
    weatherCode: data.hourly.weather_code[index],
    weatherDescription: describeWeatherCode(data.hourly.weather_code[index]),
    windSpeed: data.hourly.wind_speed_10m[index],
    windGust: data.hourly.wind_gusts_10m[index],
    windDirection: data.hourly.wind_direction_10m[index],
    visibility: data.hourly.visibility?.[index] ?? null,
  }));

  const daily: DailyForecast[] = data.daily.time.map((date: string, index: number) => ({
    date,
    tempMax: data.daily.temperature_2m_max[index],
    tempMin: data.daily.temperature_2m_min[index],
    precipSum: data.daily.precipitation_sum[index],
    precipProbability: data.daily.precipitation_probability_max[index],
    weatherDescription: describeWeatherCode(data.daily.weather_code[index]),
    windSpeedMax: data.daily.wind_speed_10m_max[index],
    windGustMax: data.daily.wind_gusts_10m_max[index],
  }));

  const retrievedAt = new Date().toISOString();
  const provider: ProviderMetadata = model === "gfs"
    ? { provider: "NOAA NCEP", model: "GFS", access: "Open-Meteo GFS API", endpoint, retrievedAt }
    : { provider: "Open-Meteo", model: "Best match forecast blend", access: "Open-Meteo Forecast API", endpoint, retrievedAt };
  return {
    timezone: data.timezone ?? "auto",
    utcOffsetSeconds: data.utc_offset_seconds ?? 0,
    current, hourly, daily, provider, fetchedAt: retrievedAt,
  };
}

export async function getWeatherByLocation(locationName: string, model: ForecastModel = "gfs"): Promise<WeatherData | null> {
  const location = await geocodeLocation(locationName);
  if (!location) return null;
  const weather = await fetchWeather(location.lat, location.lng, model);
  return weather ? { location, ...weather } : null;
}

export async function getWeatherByCoords(lat: number, lng: number, name?: string, model: ForecastModel = "gfs"): Promise<WeatherData | null> {
  const weather = await fetchWeather(lat, lng, model);
  if (!weather) return null;
  const location: GeoLocation = { lat, lng, name: name ?? `${lat.toFixed(2)}, ${lng.toFixed(2)}` };
  return { location, ...weather };
}

export function formatWeatherForLLM(data: WeatherData): string {
  const location = [data.location.name, data.location.admin1, data.location.country].filter(Boolean).join(", ");
  const current = data.current;
  const daily = data.daily.map((day) =>
    `${day.date}: ${day.tempMin}-${day.tempMax} C, ${day.weatherDescription}, rain ${day.precipSum} mm (${day.precipProbability}%), wind ${day.windSpeedMax} km/h, gust ${day.windGustMax} km/h`,
  ).join("\n");
  return [
    `Location: ${location} (${data.location.lat}, ${data.location.lng})`,
    `Provider: ${data.provider.provider}; model: ${data.provider.model}; access: ${data.provider.access}`,
    `Retrieved: ${data.provider.retrievedAt}; timezone: ${data.timezone}`,
    `Current at ${current.time}: ${current.temperature} C, feels ${current.apparentTemperature} C, humidity ${current.humidity}%, ${current.weatherDescription}, precipitation ${current.precipitation} mm, wind ${current.windSpeed} km/h, gust ${current.windGust} km/h`,
    "Daily forecast:", daily,
  ].join("\n");
}
