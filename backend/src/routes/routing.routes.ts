import { Router } from "express";
import { calculateEvacuationRoute } from "../services/osrmRouting.js";
import { assessLandslideRisk } from "../services/landslideRisk.js";

const router = Router();

router.post("/evacuation-path", async (req, res) => {
  try {
    const { fromLat, fromLng, toLat, toLng } = req.body;
    if (fromLat == null || fromLng == null || toLat == null || toLng == null) {
      res.status(400).json({ error: "Missing required coordinates (fromLat, fromLng, toLat, toLng)" });
      return;
    }

    const route = await calculateEvacuationRoute(
      parseFloat(fromLat),
      parseFloat(fromLng),
      parseFloat(toLat),
      parseFloat(toLng)
    );

    res.json(route);
  } catch (err: any) {
    res.status(500).json({ error: `Routing calculation failed: ${err.message}` });
  }
});

router.get("/landslide-risk", (req, res) => {
  try {
    const { lat, lon, rainfallMm } = req.query;
    if (!lat || !lon) {
      res.status(400).json({ error: "Missing query parameters 'lat' and 'lon'." });
      return;
    }

    const assessment = assessLandslideRisk(
      parseFloat(lat as string),
      parseFloat(lon as string),
      rainfallMm ? parseFloat(rainfallMm as string) : 0
    );

    res.json(assessment);
  } catch (err: any) {
    res.status(500).json({ error: `Landslide risk calculation failed: ${err.message}` });
  }
});

export default router;
