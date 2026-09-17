import { Router } from "express";
import { pollingService } from "../jobs/sourcePolling.js";
import { WEATHER_GPT_SYSTEM_PROMPT } from "../services/weatherGptPrompt.js";
import { getWeatherByLocation, formatWeatherForLLM } from "../services/openMeteo.js";

const router = Router();

router.post("/chat", async (req, res) => {
  try {
    const { message, history, locationContext } = req.body;

    if (!message) {
      res.status(400).json({ error: "Missing prompt 'message'." });
      return;
    }

    // Retrieve live cached events to construct real-time context for LLM
    const activeEvents = pollingService.getEvents();
    const indiaEvents = activeEvents.filter(e => 
      e.state || (e.latitude >= 6 && e.latitude <= 37 && e.longitude >= 68 && e.longitude <= 98)
    );

    const contextSummary = indiaEvents.map(e => 
      `- [${e.severity}] ${e.source} (${e.hazardType}): ${e.title} @ ${e.location || 'India'} (Lat: ${e.latitude}, Lon: ${e.longitude})`
    ).join("\n");

    // ── Proactive Open-Meteo weather fetch ──────────────────────────────────
    // Try to extract a location name from the user message and fetch weather
    let openMeteoContext = "";
    try {
      // Simple heuristic: extract location keywords after "in", "for", "at", or use the full message
      const locMatch = message.match(/(?:in|for|at|of|near)\s+([A-Z][a-zA-Z\s,]+?)(?:\?|$|\.|\!|,\s*(?:and|or|what|how|will|is|are|do|can))/i);
      const locationGuess = locMatch ? locMatch[1].trim() : null;
      
      if (locationGuess && locationGuess.length >= 3 && locationGuess.length <= 60) {
        const weatherData = await getWeatherByLocation(locationGuess);
        if (weatherData) {
          openMeteoContext = `\n\n============================================================\nLIVE OPEN-METEO WEATHER DATA FOR USER QUERY:\n============================================================\n${formatWeatherForLLM(weatherData)}`;
        }
      }
    } catch (weatherErr) {
      console.warn("[WeatherGPT] Open-Meteo proactive fetch failed:", weatherErr);
    }

    const fullSystemPrompt = `${WEATHER_GPT_SYSTEM_PROMPT}

============================================================
LIVE ACTIVE INDIA DISASTER & WEATHER EVENTS CONTEXT:
============================================================
${contextSummary.length > 0 ? contextSummary : "No critical live warnings currently active."}
${openMeteoContext}
${locationContext ? `User Current Location Context: ${JSON.stringify(locationContext)}` : ""}
`;


    const googleKey = process.env.GOOGLE_API_KEY || "";
    const openRouterKey = process.env.OPENROUTER_API_KEY;

    let responseText = "";

    if (googleKey) {
      const googleRes = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${googleKey}`
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [
            { role: "system", content: fullSystemPrompt },
            ...(Array.isArray(history) ? history : []),
            { role: "user", content: message }
          ],
          temperature: 0.3,
          max_tokens: 1024
        })
      }).catch(() => null);

      if (googleRes && googleRes.ok) {
        const googleData = await googleRes.json();
        responseText = googleData.choices?.[0]?.message?.content || "";
      }
    }

    if (!responseText && openRouterKey) {
      const openRouterRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openRouterKey}`,
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Sentinel WeatherGPT"
        },
        body: JSON.stringify({
          model: "meta-llama/llama-3.1-70b-instruct",
          messages: [
            { role: "system", content: fullSystemPrompt },
            ...(Array.isArray(history) ? history : []),
            { role: "user", content: message }
          ],
          temperature: 0.3
        })
      }).catch(() => null);

      if (openRouterRes && openRouterRes.ok) {
        const data = await openRouterRes.json();
        responseText = data.choices?.[0]?.message?.content || "";
      }
    }

    // Heuristic Fallback if API keys are not provided or remote API fails
    if (!responseText) {
      responseText = generateLocalWeatherGptResponse(message, indiaEvents);
    }

    res.json({
      reply: responseText,
      activeEventsCount: indiaEvents.length,
      timestamp: new Date().toISOString()
    });

  } catch (err: any) {
    console.error("[WeatherGPT Route Error]:", err);
    res.status(500).json({ error: `WeatherGPT service error: ${err.message}` });
  }
});

function generateLocalWeatherGptResponse(userMsg: string, events: any[]): string {
  const query = userMsg.toLowerCase();

  const matchingEvents = events.filter(e => 
    query.includes(e.hazardType) || 
    (e.state && query.includes(e.state.toLowerCase())) ||
    (e.district && query.includes(e.district.toLowerCase())) ||
    (e.location && query.includes(e.location.toLowerCase()))
  );

  if (matchingEvents.length > 0) {
    const primary = matchingEvents[0];
    return `### 🚨 **WeatherGPT Alert Summary: ${primary.title}**

**Source Agency**: ${primary.sourceAgency || primary.source}  
**Severity**: ${primary.severity}  
**Location**: ${primary.location || 'India'}  
**Coordinates**: Lat ${primary.latitude}, Lon ${primary.longitude}  

#### **Current Situation & Instructions:**
${primary.instructions ? primary.instructions.map((ins: string) => `- ${ins}`).join("\n") : "- Follow local authority advisories and NDMA guidelines."}

#### **Emergency Contacts:**
- National Emergency (NDMA): **1070**
- State / District Control Room: **1077**
- National Emergency Response Support System: **112**`;
  }

  if (query.includes("rain") || query.includes("flood") || query.includes("weather")) {
    return `### 🌧️ **WeatherGPT Indian Weather & Flood Intelligence**

Currently tracking **${events.length} active multi-hazard advisories** across India.

- **CWC River Monitoring**: Active flood gauges in Brahmaputra (Assam), Ganga (Bihar/UP), and Yamuna basins.
- **IMD District Warnings**: Monitoring heavy rainfall in Western Ghats & North-East states.
- **INCOIS Advisories**: Monitoring high wave & swell surge conditions along coastal belts.

*Ask WeatherGPT for specific state/district advisories or emergency evacuation guidance.*`;
  }

  return `### 🛡️ **Sentinel WeatherGPT India**

I am monitoring **${events.length} live disaster alerts** across Indian states, river basins, coastal waters, and satellite observations.

You can ask me:
- *"Show active flood warnings in Assam or Bihar"*
- *"What is the weather alert for Kerala or Wayanad?"*
- *"Are there active forest fires detected in Western Ghats?"*
- *"Give emergency response steps for heavy rain in Mumbai"*`;
}

export default router;
