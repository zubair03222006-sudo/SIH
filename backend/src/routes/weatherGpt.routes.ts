import { Router } from "express";
import { getWeatherByLocation } from "../services/openMeteo.js";
import {
  buildGroundedAnswer,
  createAdvisory,
  parseWeatherIntent,
  summarizeForecast,
  WeatherLanguage,
} from "../services/weatherGptEngine.js";

const router = Router();

const MESSAGES: Record<
  WeatherLanguage,
  { location: string; unavailable: string }
> = {
  "en-IN": {
    location:
      "Please include an Indian city or place in your weather question.",
    unavailable:
      "Current forecast data is unavailable, so I cannot provide weather values or an advisory right now.",
  },
  "hi-IN": {
    location: "कृपया अपने मौसम प्रश्न में भारत का शहर या स्थान लिखें।",
    unavailable:
      "वर्तमान पूर्वानुमान डेटा उपलब्ध नहीं है, इसलिए मैं अभी मौसम के आंकड़े या सलाह नहीं दे सकता।",
  },
  "te-IN": {
    location:
      "దయచేసి మీ వాతావరణ ప్రశ్నలో భారతీయ నగరం లేదా ప్రదేశాన్ని పేర్కొనండి.",
    unavailable:
      "ప్రస్తుత అంచనా డేటా అందుబాటులో లేదు. అందువల్ల ఇప్పుడు వాతావరణ విలువలు లేదా సలహా ఇవ్వలేను.",
  },
  "mr-IN": {
    location: "कृपया हवामानाच्या प्रश्नात भारतातील शहर किंवा ठिकाण नमूद करा.",
    unavailable:
      "सध्याचा अंदाज डेटा उपलब्ध नाही, त्यामुळे आत्ता हवामान मूल्ये किंवा सल्ला देता येणार नाही.",
  },
  "bn-IN": {
    location:
      "অনুগ্রহ করে আবহাওয়ার প্রশ্নে ভারতের একটি শহর বা স্থানের নাম দিন।",
    unavailable:
      "বর্তমান পূর্বাভাসের তথ্য পাওয়া যাচ্ছে না, তাই এখন আবহাওয়ার মান বা পরামর্শ দেওয়া সম্ভব নয়।",
  },
  "ta-IN": {
    location: "வானிலை கேள்வியில் இந்திய நகரம் அல்லது இடத்தைக் குறிப்பிடவும்.",
    unavailable:
      "தற்போதைய முன்னறிவிப்புத் தரவு கிடைக்கவில்லை; இப்போது வானிலை மதிப்புகள் அல்லது ஆலோசனை வழங்க முடியாது.",
  },
  "kn-IN": {
    location: "ದಯವಿಟ್ಟು ಹವಾಮಾನ ಪ್ರಶ್ನೆಯಲ್ಲಿ ಭಾರತದ ನಗರ ಅಥವಾ ಸ್ಥಳವನ್ನು ನಮೂದಿಸಿ.",
    unavailable:
      "ಪ್ರಸ್ತುತ ಮುನ್ಸೂಚನೆ ಡೇಟಾ ಲಭ್ಯವಿಲ್ಲ; ಈಗ ಹವಾಮಾನ ಮೌಲ್ಯಗಳು ಅಥವಾ ಸಲಹೆ ನೀಡಲು ಸಾಧ್ಯವಿಲ್ಲ.",
  },
  "ml-IN": {
    location: "കാലാവസ്ഥാ ചോദ്യത്തിൽ ഇന്ത്യയിലെ ഒരു നഗരമോ സ്ഥലമോ ഉൾപ്പെടുത്തുക.",
    unavailable:
      "നിലവിലെ പ്രവചന ഡാറ്റ ലഭ്യമല്ല; ഇപ്പോൾ കാലാവസ്ഥാ മൂല്യങ്ങളോ ഉപദേശമോ നൽകാനാകില്ല.",
  },
};

async function getOptionalLlmExplanation(
  language: WeatherLanguage,
  evidence: unknown,
  recommendation: string,
): Promise<{
  used: boolean;
  provider: string | null;
  explanation: string | null;
}> {
  const googleKey = process.env.GOOGLE_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const provider = googleKey ? "google" : openRouterKey ? "openrouter" : null;
  if (!provider) return { used: false, provider: null, explanation: null };

  const endpoint =
    provider === "google"
      ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
      : "https://openrouter.ai/api/v1/chat/completions";
  const apiKey = provider === "google" ? googleKey : openRouterKey;
  const model =
    provider === "google"
      ? "gemini-2.5-flash"
      : process.env.OPENROUTER_MODEL || "meta-llama/llama-3.1-70b-instruct";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 100,
        messages: [
          {
            role: "system",
            content: `Explain the supplied rule-based recommendation in one short sentence in ${language}. Use only the supplied evidence. Do not introduce any number, measurement, date, forecast claim, or new advice.`,
          },
          {
            role: "user",
            content: JSON.stringify({ evidence, recommendation }),
          },
        ],
      }),
    });
    if (!response.ok) return { used: false, provider, explanation: null };
    const data = await response.json();
    const explanation = String(
      data.choices?.[0]?.message?.content ?? "",
    ).trim();
    // Measurements and all factual values remain deterministic. Reject LLM text
    // containing digits or measurement symbols rather than risking fabrication.
    if (
      !explanation ||
      explanation.length > 400 ||
      /[\d%°]/u.test(explanation)
    ) {
      return { used: false, provider, explanation: null };
    }
    return { used: true, provider, explanation };
  } catch {
    return { used: false, provider, explanation: null };
  } finally {
    clearTimeout(timeoutId);
  }
}

router.post("/chat", async (req, res) => {
  const { message, language, simulateProviderFailure } = req.body ?? {};
  if (typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "A non-empty 'message' is required." });
    return;
  }

  const intent = parseWeatherIntent(message, language);
  if (!intent.locationQuery) {
    res.status(422).json({
      error: MESSAGES[intent.language].location,
      code: "LOCATION_REQUIRED",
      language: intent.language,
    });
    return;
  }

  const forcedFailure =
    process.env.WEATHERGPT_FORCE_PROVIDER_FAILURE === "true" ||
    (process.env.NODE_ENV !== "production" && simulateProviderFailure === true);
  if (forcedFailure) {
    res.status(503).json({
      error: MESSAGES[intent.language].unavailable,
      code: "WEATHER_UNAVAILABLE",
      language: intent.language,
    });
    return;
  }

  try {
    const weather = await getWeatherByLocation(intent.locationQuery, "gfs");
    if (!weather) {
      res.status(503).json({
        error: MESSAGES[intent.language].unavailable,
        code: "WEATHER_UNAVAILABLE",
        language: intent.language,
      });
      return;
    }

    const summary = summarizeForecast(weather, intent);
    if (!summary) {
      res.status(503).json({
        error: MESSAGES[intent.language].unavailable,
        code: "FORECAST_WINDOW_UNAVAILABLE",
        language: intent.language,
      });
      return;
    }

    const locationLabel = [
      weather.location.name,
      weather.location.admin1,
      weather.location.country,
    ]
      .filter(Boolean)
      .join(", ");
    const advisory = createAdvisory(intent, summary.evidence);
    const answer = buildGroundedAnswer(
      intent,
      locationLabel,
      summary,
      summary.evidence,
      advisory,
    );
    const llm = await getOptionalLlmExplanation(
      intent.language,
      summary.evidence,
      advisory.recommendation,
    );

    res.json({
      answer: llm.explanation ? `${answer}\n\n${llm.explanation}` : answer,
      language: intent.language,
      intent: {
        dayOffset: intent.dayOffset,
        period: intent.period,
        advisoryType: intent.advisoryType,
      },
      location: { ...weather.location, label: locationLabel },
      forecastWindow: {
        date: summary.date,
        startTime: summary.startTime,
        endTime: summary.endTime,
        timezone: weather.timezone,
      },
      evidence: summary.evidence,
      advisory,
      provenance: weather.provider,
      llm,
    });
  } catch (error) {
    console.error("[WeatherGPT] Grounded request failed:", error);
    res.status(503).json({
      error: MESSAGES[intent.language].unavailable,
      code: "WEATHER_UNAVAILABLE",
      language: intent.language,
    });
  }
});

export default router;
