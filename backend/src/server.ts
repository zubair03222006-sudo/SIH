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

// ──────────────────────────────────────────────────────────────────────────────
// LLM Proxy — hides API keys from the frontend bundle
// Primary:  Google AI Studio  (gemini-2.5-flash, fast)
// Fallback: OpenRouter        (inclusionai/ling-3.0-flash-fin:free)
// ──────────────────────────────────────────────────────────────────────────────

const GOOGLE_CHAT_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const GOOGLE_MODEL = "gemini-2.5-flash";
const OPENROUTER_MODEL_DEFAULT = "inclusionai/ling-3.0-flash-fin:free";

async function callLLM(
  endpoint: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  timeoutMs = 20_000,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = r.ok ? await r.json() : await r.text();
    return { ok: r.ok, status: r.status, data };
  } finally {
    clearTimeout(timerId);
  }
}

// Auto-fallback: try Google first; on failure fall back to OpenRouter
app.post("/api/chat/auto", async (req, res) => {
  const { messages, system, max_tokens = 512, temperature = 0.7 } = req.body ?? {};
  if (!messages) {
    res.status(400).json({ error: "Missing required field: messages" });
    return;
  }

  const googleKey = process.env.GOOGLE_API_KEY || "";
  const openRouterKey = process.env.OPENROUTER_API_KEY || "";
  const openRouterModel = process.env.OPENROUTER_MODEL || OPENROUTER_MODEL_DEFAULT;

  const allMessages = system
    ? [{ role: "system", content: system }, ...messages]
    : messages;

  // ── Try Google AI Studio first ──
  if (googleKey) {
    try {
      const result = await callLLM(
        GOOGLE_CHAT_ENDPOINT,
        { "Content-Type": "application/json", Authorization: `Bearer ${googleKey}` },
        { model: GOOGLE_MODEL, messages: allMessages, max_tokens, temperature },
        15_000,
      );
      if (result.ok) {
        res.json({ ...(result.data as object), _provider: "google", _model: GOOGLE_MODEL });
        return;
      }
      console.warn("[AEGIS] Google LLM failed, falling back to OpenRouter:", result.data);
    } catch (err) {
      console.warn("[AEGIS] Google LLM error, falling back to OpenRouter:", err);
    }
  }

  // ── Fall back to OpenRouter ──
  if (!openRouterKey) {
    res.status(503).json({ error: "No LLM provider is configured." });
    return;
  }
  try {
    const result = await callLLM(
      OPENROUTER_ENDPOINT,
      {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openRouterKey}`,
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "AEGIS AI Agent",
      },
      { model: openRouterModel, messages: allMessages, max_tokens, temperature },
      20_000,
    );
    if (result.ok) {
      res.json({ ...(result.data as object), _provider: "openrouter", _model: openRouterModel });
      return;
    }
    res.status(result.status as number).json({ error: result.data });
  } catch (err: any) {
    res.status(500).json({ error: `LLM proxy error: ${err.message}` });
  }
});

// Explicit provider proxy (legacy / WeatherGPT internal use)
app.post("/api/chat", async (req, res) => {
  const { provider, body } = req.body;
  if (!provider || !body) {
    res.status(400).json({ error: "Missing required fields (provider, body)" });
    return;
  }

  let endpoint = "";
  let apiKey = "";
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (provider === "google") {
    endpoint = GOOGLE_CHAT_ENDPOINT;
    apiKey = process.env.GOOGLE_API_KEY || "";
    if (!apiKey) { res.status(500).json({ error: "Google API key not configured on backend." }); return; }
    headers["Authorization"] = `Bearer ${apiKey}`;
    // Inject canonical model if caller didn't set one
    if (body && typeof body === "object" && !(body as any).model) {
      (body as any).model = GOOGLE_MODEL;
    }
  } else if (provider === "openrouter") {
    endpoint = OPENROUTER_ENDPOINT;
    apiKey = process.env.OPENROUTER_API_KEY || "";
    if (!apiKey) { res.status(500).json({ error: "OpenRouter API key not configured on backend." }); return; }
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["HTTP-Referer"] = "http://localhost:3000";
    headers["X-Title"] = "AEGIS AI Agent";
    // Inject the configured model if caller didn't set one
    if (body && typeof body === "object" && !(body as any).model) {
      (body as any).model = process.env.OPENROUTER_MODEL || OPENROUTER_MODEL_DEFAULT;
    }
  } else {
    res.status(400).json({ error: "Invalid provider. Must be 'google' or 'openrouter'" });
    return;
  }

  try {
    const result = await callLLM(endpoint, headers, body as Record<string, unknown>);
    if (result.ok) { res.json(result.data); return; }
    res.status(result.status).send(result.data);
  } catch (err: any) {
    console.error(`[AEGIS Backend] LLM proxy error for ${provider}:`, err);
    res.status(500).json({ error: `Backend LLM proxy error: ${err.message}` });
  }
});

// Keep intervals for the long-running local server. Vercel functions fetch on
// demand through `ensureFresh`, because background timers are not persistent.
if (!process.env.VERCEL) {
  pollingService.start();
}

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Sentinel Backend running on http://localhost:${PORT}`);
  });
}

export default app;

