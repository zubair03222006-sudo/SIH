import { Router } from "express";
import { pollingService } from "../jobs/sourcePolling.js";
import { WRFRegionalForecastAdapter } from "../ingestion/wrfAdapter.stub.js";

const router = Router();

// Add the WRF stub just for health reporting
const wrfStub = new WRFRegionalForecastAdapter();

router.get("/health", async (req, res) => {
  await pollingService.ensureFresh();
  const adapters = pollingService.getAdapters();
  
  const healthStatus = adapters.map(a => a.getHealth());
  healthStatus.push(wrfStub.getHealth());
  
  res.json({
    sources: healthStatus
  });
});

export default router;
