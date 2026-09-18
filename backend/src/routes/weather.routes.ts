import { Router } from "express";
import {
  getWeatherByLocation,
  getWeatherByCoords,
  formatWeatherForLLM,
} from "../services/openMeteo.js";

const router = Router();

/**
 * POST /api/weather/lookup
 * Body: { location: string } OR { lat: number, lng: number }
 *
 * Returns current, hourly and 7-day NOAA GFS forecast data via Open-Meteo.
 */
router.post("/lookup", async (req, res) => {
  try {
    const { location, lat, lng } = req.body;

    if (!location && (lat === undefined || lng === undefined)) {
      res.status(400).json({ error: "Provide 'location' (name) or 'lat'+'lng' (coordinates)." });
      return;
    }

    let weatherData;

    if (location) {
      weatherData = await getWeatherByLocation(location);
      if (!weatherData) {
        res.status(404).json({
          error: `Could not find weather data for "${location}". Try a more specific city or district name.`,
        });
        return;
      }
    } else {
      weatherData = await getWeatherByCoords(lat, lng);
      if (!weatherData) {
        res.status(500).json({ error: "Failed to fetch weather data from Open-Meteo." });
        return;
      }
    }

    const formatted = formatWeatherForLLM(weatherData);

    res.json({
      success: true,
      location: weatherData.location,
      timezone: weatherData.timezone,
      current: weatherData.current,
      hourly: weatherData.hourly,
      daily: weatherData.daily,
      provider: weatherData.provider,
      formatted,
      fetchedAt: weatherData.fetchedAt,
    });
  } catch (err: any) {
    console.error("[Weather Route Error]:", err);
    res.status(500).json({ error: `Weather service error: ${err.message}` });
  }
});

export default router;
