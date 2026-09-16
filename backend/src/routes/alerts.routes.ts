import { Router } from "express";
import { pollingService } from "../jobs/sourcePolling.js";

const router = Router();

// Returns official India alerts (from SACHET/NDMA or IMD adapters if available)
router.get("/", (req, res) => {
  const allEvents = pollingService.getEvents();
  
  const officialAlerts = allEvents.filter(e => 
    e.sourceAgency === "NDMA" || e.sourceAgency === "IMD" || e.sourceAgency === "CWC"
  );
  
  res.json({
    alerts: officialAlerts,
    loading: allEvents.length === 0,
    lastUpdated: new Date()
  });
});

export default router;
