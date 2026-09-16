import { Router } from "express";
import { DisasterEvent } from "../types/disaster.js";
import { pollingService } from "../jobs/sourcePolling.js";

const router = Router();

// In-memory store for user/responder submitted field reports
const fieldReports: DisasterEvent[] = [];

router.get("/", (req, res) => {
  res.json(fieldReports);
});

router.post("/", (req, res) => {
  try {
    const { title, location, latitude, longitude, hazardType, severity, reporterName, reporterRole, description } = req.body;

    if (!title || latitude == null || longitude == null) {
      res.status(400).json({ error: "Missing required fields (title, latitude, longitude)" });
      return;
    }

    const now = new Date();
    const newReport: DisasterEvent = {
      id: `field-report-${now.getTime()}-${Math.random().toString(36).substring(2, 7)}`,
      source: "FIELD_REPORT",
      sourceAgency: reporterRole || "Field Responder",
      hazardType: hazardType || "other",
      title: `[Field Report] ${title}`,
      location: location || `Lat ${latitude}, Lon ${longitude}`,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      coords: [parseFloat(latitude), parseFloat(longitude)],
      severity: severity || "Warning",
      urgency: "immediate",
      certainty: "observed",
      verificationStatus: "field_report",
      issuedAt: now.toISOString(),
      observedAt: now.toISOString(),
      description: description || `Submitted by ${reporterName || "Ground Observer"}`,
      instructions: [
        `Field Observation: ${description || title}`,
        `Reported by: ${reporterName || "Ground Responder"} (${reporterRole || "Citizen Observer"})`
      ],
      color: "text-emerald-400",
      dot: "bg-emerald-500",
    };

    fieldReports.unshift(newReport);

    res.status(201).json({
      message: "Field report submitted successfully.",
      report: newReport
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to record field report: ${err.message}` });
  }
});

export default router;
