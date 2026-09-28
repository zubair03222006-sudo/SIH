import { HourlyForecast, WeatherData } from "./openMeteo.js";

export type WeatherLanguage = "en-IN" | "hi-IN" | "te-IN";
export type DayPeriod = "current" | "morning" | "afternoon" | "evening" | "night" | "day";
export type RiskLevel = "low" | "moderate" | "high";

export interface WeatherIntent {
  language: WeatherLanguage;
  locationQuery: string | null;
  dayOffset: 0 | 1;
  period: DayPeriod;
  advisoryType: "pesticide_spray" | "general";
}

export interface WeatherEvidence {
  temperatureC: number;
  apparentTemperatureC: number;
  humidityPercent: number;
  precipitationMm: number;
  precipitationProbabilityPercent: number;
  weatherCode: number;
  weatherDescription: string;
  windSpeedKmh: number;
  windGustKmh: number;
  windDirectionDegrees: number;
  visibilityMeters: number | null;
}

export interface AdvisoryResult {
  riskLevel: RiskLevel;
  recommendation: string;
  explanation: string;
  prototypeLogic: true;
}

export function detectLanguage(message: string, requested?: string): WeatherLanguage {
  if (requested === "en-IN" || requested === "hi-IN" || requested === "te-IN") return requested;
  if (/\p{Script=Telugu}/u.test(message)) return "te-IN";
  if (/\p{Script=Devanagari}/u.test(message)) return "hi-IN";
  return "en-IN";
}

/**
 * Extract a location name from a natural language weather query.
 * No hardcoded place lists — pure NLP regex patterns.
 * The geocoder handles all place resolution.
 */
function extractLocation(message: string): string | null {
  // Common time/weather/query stop words to strip before or after location
  const TIME_WEATHER = "today|tomorrow|yesterday|this|on|during|morning|afternoon|evening|night|weather|forecast|report|climate|temperature|advisory|pesticide|spray";
  const QUERY_WORDS = "what|was|is|the|will|be|tell|me|show|give|how|please|now|right|condition|details|accurate|predictive|around";

  // 1. After preposition: "in LB Nagar", "at Gachibowli", "for Madhapur", "near Dilsukhnagar"
  const prepMatch = message.match(
    new RegExp(`(?:in|at|near|for|of|around)\\s+([\\p{L}0-9][\\p{L}0-9\\s'-]{1,44}?)(?=\\s+(?:${TIME_WEATHER})|[?.!,]|$)`, "iu"),
  );
  if (prepMatch?.[1]?.trim()) return prepMatch[1].trim();

  // 2. Before weather keywords: "Gachibowli weather", "LB Nagar forecast"
  const prefixMatch = message.match(/([\p{L}0-9][\p{L}0-9\s'-]{1,44}?)\s+(?:weather|forecast|report|climate|temperature)/iu);
  if (prefixMatch?.[1]?.trim()) {
    const raw = prefixMatch[1].trim();
    // Strip leading query noise
    const cleaned = raw.replace(new RegExp(`^(?:${QUERY_WORDS})(?:\\s+(?:${QUERY_WORDS}))*\\s+`, "gi"), "").trim();
    if (cleaned.length >= 2) return cleaned;
  }

  // 3. Telugu / Hindi postpositions: "నిజామాబాద్‌లో" (with ZWNJ), "दिल्ली में"
  // Strip zero-width non-joiner (U+200C) before matching so "name‌లో" → "nameలో"
  const deZwnj = message.replace(/\u200c/g, "");
  const teluguMatch = deZwnj.match(/([\p{L}0-9][\p{L}0-9\s'-]{0,30}?)\s*(?:లో|లోని|వద్ద|దగ్గర)/u);
  if (teluguMatch?.[1]?.trim()) return teluguMatch[1].trim();
  // Match the word or compound directly before the Hindi postposition
  const hindiMatch = message.match(/([\p{L}0-9][\p{L}0-9'-]*)\s+(?:में|का|की|के|पर)/u);
  if (hindiMatch?.[1]?.trim()) return hindiMatch[1].trim();

  // 4. Stop-word fallback: strip all known noise words and return the remainder
  const stripped = message
    .replace(new RegExp(`\\b(?:${TIME_WEATHER}|${QUERY_WORDS}|in|at|for|of|near|వాతావరణం|ఎలా|ఉంటుంది|రేపు|ఈరోజు|నివేదిక|తెలపండి|చెప్పండి|మౌసమ్|मौसम|कैसा|रहेगा|आज|कल|बताओ|जानकारी)\\b`, "giu"), " ")
    .replace(/[\p{Punctuation}\p{Symbol}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (stripped.length >= 2 && stripped.length <= 60) return stripped;
  return null;
}

export function parseWeatherIntent(message: string, requestedLanguage?: string): WeatherIntent {
  const lower = message.toLocaleLowerCase();
  const tomorrow = /\btomorrow\b|कल|రేపు/u.test(lower);
  let period: DayPeriod = "day";
  if (/morning|सुबह|ఉదయం/u.test(lower)) period = "morning";
  else if (/afternoon|दोपहर|మధ్యాహ్నం/u.test(lower)) period = "afternoon";
  else if (/evening|शाम|సాయంత్రం/u.test(lower)) period = "evening";
  else if (/night|रात|రాత్రి/u.test(lower)) period = "night";
  else if (/current|right now|अभी|ఇప్పుడు/u.test(lower)) period = "current";

  return {
    language: detectLanguage(message, requestedLanguage),
    locationQuery: extractLocation(message),
    dayOffset: tomorrow ? 1 : 0,
    period,
    advisoryType: /pesticide|spray|कीटनाशक|छिड़काव|పురుగుమందు|స్ప్రే/u.test(lower) ? "pesticide_spray" : "general",
  };
}

const PERIOD_HOURS: Record<Exclude<DayPeriod, "current">, [number, number]> = {
  morning: [6, 11], afternoon: [12, 16], evening: [17, 20], night: [21, 23], day: [6, 21],
};

const round1 = (value: number) => Number(value.toFixed(1));
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

export function summarizeForecast(data: WeatherData, intent: WeatherIntent): {
  date: string;
  startTime: string;
  endTime: string;
  evidence: WeatherEvidence;
} | null {
  if (intent.period === "current") {
    return {
      date: data.current.time.slice(0, 10), startTime: data.current.time, endTime: data.current.time,
      evidence: {
        temperatureC: data.current.temperature, apparentTemperatureC: data.current.apparentTemperature,
        humidityPercent: data.current.humidity, precipitationMm: data.current.precipitation,
        precipitationProbabilityPercent: 0, weatherCode: data.current.weatherCode,
        weatherDescription: data.current.weatherDescription, windSpeedKmh: data.current.windSpeed,
        windGustKmh: data.current.windGust, windDirectionDegrees: data.current.windDirection,
        visibilityMeters: data.current.visibility,
      },
    };
  }

  const date = data.daily[intent.dayOffset]?.date;
  if (!date) return null;
  const [startHour, endHour] = PERIOD_HOURS[intent.period];
  const points = data.hourly.filter((point) => {
    const [pointDate, pointTime] = point.time.split("T");
    const hour = Number(pointTime?.slice(0, 2));
    return pointDate === date && hour >= startHour && hour <= endHour;
  });
  if (points.length === 0) return null;

  const wettest = points.reduce((best, point) => point.precipitationProbability > best.precipitationProbability ? point : best);
  const strongestWind = points.reduce((best, point) => point.windGust > best.windGust ? point : best);
  const visible = points.map((point) => point.visibility).filter((value): value is number => value != null);
  return {
    date,
    startTime: points[0].time,
    endTime: points[points.length - 1].time,
    evidence: {
      temperatureC: round1(average(points.map((point) => point.temperature))),
      apparentTemperatureC: round1(average(points.map((point) => point.apparentTemperature))),
      humidityPercent: Math.round(average(points.map((point) => point.humidity))),
      precipitationMm: round1(points.reduce((sum, point) => sum + point.precipitation, 0)),
      precipitationProbabilityPercent: Math.max(...points.map((point) => point.precipitationProbability)),
      weatherCode: wettest.weatherCode,
      weatherDescription: wettest.weatherDescription,
      windSpeedKmh: round1(Math.max(...points.map((point) => point.windSpeed))),
      windGustKmh: round1(strongestWind.windGust),
      windDirectionDegrees: strongestWind.windDirection,
      visibilityMeters: visible.length ? Math.min(...visible) : null,
    },
  };
}

function recommendation(language: WeatherLanguage, risk: RiskLevel, spray: boolean): string {
  const text = {
    "en-IN": spray
      ? { high: "Do not spray pesticide in this forecast window.", moderate: "Postpone spraying if possible; conditions are marginal.", low: "Conditions are generally suitable for spraying, subject to local field conditions." }
      : { high: "Use caution and adjust outdoor plans.", moderate: "Monitor conditions before extended outdoor activity.", low: "No major weather risk is indicated by this prototype rule set." },
    "hi-IN": spray
      ? { high: "इस पूर्वानुमान अवधि में कीटनाशक का छिड़काव न करें।", moderate: "संभव हो तो छिड़काव टालें; परिस्थितियाँ सीमांत हैं।", low: "स्थानीय खेत की स्थिति के अनुसार छिड़काव सामान्यतः उपयुक्त है।" }
      : { high: "सावधानी रखें और बाहरी योजनाएँ बदलें।", moderate: "लंबी बाहरी गतिविधि से पहले मौसम देखें।", low: "प्रोटोटाइप नियमों में कोई बड़ा मौसम जोखिम नहीं मिला।" },
    "te-IN": spray
      ? { high: "ఈ అంచనా సమయంలో పురుగుమందు పిచికారీ చేయవద్దు.", moderate: "వీలైతే పిచికారీని వాయిదా వేయండి; పరిస్థితులు అనుకూలంగా లేవు.", low: "స్థానిక పొలం పరిస్థితులను బట్టి పిచికారీకి సాధారణంగా అనుకూలం." }
      : { high: "జాగ్రత్తగా ఉండి బహిరంగ ప్రణాళికలను మార్చండి.", moderate: "ఎక్కువసేపు బయట ఉండే ముందు వాతావరణాన్ని పరిశీలించండి.", low: "ప్రోటోటైప్ నియమాల ప్రకారం ప్రధాన వాతావరణ ప్రమాదం కనిపించలేదు." },
  } as const;
  return text[language][risk];
}

export function createAdvisory(intent: WeatherIntent, evidence: WeatherEvidence): AdvisoryResult {
  const rainRisk = evidence.precipitationProbabilityPercent >= 70 || evidence.precipitationMm >= 7.5;
  const windRisk = evidence.windSpeedKmh >= 35 || evidence.windGustKmh >= 50;
  const heatRisk = evidence.temperatureC >= 40 || evidence.apparentTemperatureC >= 43;
  const dangerousCombination = [rainRisk, windRisk, heatRisk].filter(Boolean).length >= 2;
  let riskLevel: RiskLevel = "low";

  if (intent.advisoryType === "pesticide_spray") {
    if (evidence.precipitationProbabilityPercent >= 50 || evidence.precipitationMm >= 1 || evidence.windSpeedKmh >= 20 || evidence.windGustKmh >= 30) riskLevel = "high";
    else if (evidence.precipitationProbabilityPercent >= 30 || evidence.humidityPercent >= 85 || evidence.windGustKmh >= 20) riskLevel = "moderate";
  } else if (dangerousCombination || evidence.precipitationMm >= 20 || evidence.windGustKmh >= 60 || evidence.apparentTemperatureC >= 45) {
    riskLevel = "high";
  } else if (rainRisk || windRisk || heatRisk) {
    riskLevel = "moderate";
  }

  const reasons = [
    `${evidence.precipitationProbabilityPercent}% rain probability`,
    `${evidence.precipitationMm} mm forecast precipitation`,
    `${evidence.windSpeedKmh} km/h wind and ${evidence.windGustKmh} km/h gusts`,
    `${evidence.temperatureC} C temperature (${evidence.apparentTemperatureC} C apparent)`,
  ];
  return {
    riskLevel,
    recommendation: recommendation(intent.language, riskLevel, intent.advisoryType === "pesticide_spray"),
    explanation: `Prototype thresholds evaluated: ${reasons.join(", ")}.`,
    prototypeLogic: true,
  };
}

export function buildGroundedAnswer(
  intent: WeatherIntent,
  location: string,
  forecastWindow: { date: string; startTime: string; endTime: string },
  evidence: WeatherEvidence,
  advisory: AdvisoryResult,
): string {
  if (intent.language === "hi-IN") {
    return `${location} में ${forecastWindow.date} (${intent.period}) के लिए वर्षा की अधिकतम संभावना ${evidence.precipitationProbabilityPercent}% और अनुमानित वर्षा ${evidence.precipitationMm} मिमी है। हवा ${evidence.windSpeedKmh} किमी/घंटा और झोंके ${evidence.windGustKmh} किमी/घंटा तक रह सकते हैं। तापमान लगभग ${evidence.temperatureC}°C रहेगा। ${advisory.recommendation}`;
  }
  if (intent.language === "te-IN") {
    return `${location}లో ${forecastWindow.date} (${intent.period}) సమయంలో గరిష్ఠ వర్ష సంభావ్యత ${evidence.precipitationProbabilityPercent}%, అంచనా వర్షపాతం ${evidence.precipitationMm} మి.మీ. గాలి వేగం ${evidence.windSpeedKmh} కి.మీ/గం, గాలివానలు ${evidence.windGustKmh} కి.మీ/గం వరకు ఉండవచ్చు. ఉష్ణోగ్రత సుమారు ${evidence.temperatureC}°C. ${advisory.recommendation}`;
  }
  return `For ${location} on ${forecastWindow.date} (${intent.period}), the maximum rain probability is ${evidence.precipitationProbabilityPercent}% with ${evidence.precipitationMm} mm forecast precipitation. Wind may reach ${evidence.windSpeedKmh} km/h with gusts up to ${evidence.windGustKmh} km/h. Temperature is about ${evidence.temperatureC}°C. ${advisory.recommendation}`;
}
