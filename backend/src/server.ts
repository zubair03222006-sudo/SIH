import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import eventsRoutes from "./routes/events.routes.js";
import alertsRoutes from "./routes/alerts.routes.js";
import sourcesRoutes from "./routes/sources.routes.js";
import weatherGptRoutes from "./routes/weatherGpt.routes.js";
import routingRoutes from "./routes/routing.routes.js";
import fieldReportsRoutes from "./routes/fieldReports.routes.js";
import weatherRoutes from "./routes/weather.routes.js";
import { pollingService } from "./jobs/sourcePolling.js";
import { HazardType, LiveEvent } from "./types/disaster.js";

dotenv.config();

// Re-export types that frontend might expect from server.ts (for backwards compat if any import it from here)
export type { HazardType, LiveEvent };

// --- Server Setup ---
const app = express();
const PORT = process.env.PORT || 3001;

// CORS middleware configuration
app.use(cors());

app.use(express.json());

// Mount Modular Routes
app.use("/api/events", eventsRoutes);
app.use("/api/alerts", alertsRoutes);
app.use("/api/sources", sourcesRoutes);
app.use("/api/weather-gpt", weatherGptRoutes);
app.use("/api/routing", routingRoutes);
app.use("/api/field-reports", fieldReportsRoutes);
app.use("/api/weather", weatherRoutes);

// LLM Proxy API to hide keys from the frontend bundle
app.post("/api/chat", async (req, res) => {
  const { provider, body } = req.body;
  if (!provider || !body) {
    res.status(400).json({ error: "Missing required fields (provider, body)" });
    return;
  }

  let endpoint = "";
  let apiKey = "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (provider === "google") {
    endpoint = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
    apiKey = process.env.GOOGLE_API_KEY || "";
    if (!apiKey) {
      res.status(500).json({ error: "Google API key not configured on backend." });
      return;
    }
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else if (provider === "openrouter") {
    endpoint = "https://openrouter.ai/api/v1/chat/completions";
    apiKey = process.env.OPENROUTER_API_KEY || "";
    if (!apiKey) {
      res.status(500).json({ error: "OpenRouter API key not configured on backend." });
      return;
    }
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["HTTP-Referer"] = "http://localhost:3000";
    headers["X-Title"] = "AEGIS AI Agent";
  } else {
    res.status(400).json({ error: "Invalid provider. Must be 'google' or 'openrouter'" });
    return;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(response.status).send(errorText);
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    console.error(`[AEGIS Backend] LLM proxy error for ${provider}:`, err);
    res.status(500).json({ error: `Backend LLM proxy error: ${err.message}` });
  }
});

// Start the background polling service
pollingService.start();

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Sentinel Backend running on http://localhost:${PORT}`);
  });
}

export default app;

