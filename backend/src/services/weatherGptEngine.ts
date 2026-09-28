import { HourlyForecast, WeatherData } from "./openMeteo.js";

export type WeatherLanguage =
  "en-IN" | "hi-IN" | "te-IN" | "mr-IN" | "bn-IN" | "ta-IN" | "kn-IN" | "ml-IN";
export type DayPeriod =
  "current" | "morning" | "afternoon" | "evening" | "night" | "day";
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

const LOCATIONS: Array<{ name: string; aliases: string[] }> = [
  {
    name: "Hyderabad",
    aliases: [
      "hyderabad",
      "हैदराबाद",
      "హైదరాబాద్",
      "హైదరాబాదు",
      "হায়দরাবাদ",
      "ஹைதராபாத்",
      "ಹೈದರಾಬಾದ್",
      "ഹൈദരാബാദ്",
      "ഹൈദരാബാദ",
    ],
  },
  {
    name: "Visakhapatnam",
    aliases: [
      "visakhapatnam",
      "vizag",
      "विशाखापत्तनम",
      "विशाखापट्टणम",
      "విశాఖపట్నం",
      "বিশাখাপত্তনম",
      "விசாகப்பட்டினம்",
      "ವಿಶಾಖಪಟ್ಟಣ",
      "വിശാഖപട്ടണം",
    ],
  },
  {
    name: "Mumbai",
    aliases: [
      "mumbai",
      "मुंबई",
      "ముంబై",
      "মুম্বাই",
      "மும்பை",
      "ಮುಂಬೈ",
      "മുംബൈ",
    ],
  },
  {
    name: "Delhi",
    aliases: [
      "delhi",
      "नई दिल्ली",
      "दिल्ली",
      "ఢిల్లీ",
      "দিল্লি",
      "டெல்லி",
      "ದೆಹಲಿ",
      "ഡൽഹി",
    ],
  },
  {
    name: "Bengaluru",
    aliases: [
      "bengaluru",
      "bangalore",
      "बेंगलुरु",
      "बेंगळुरू",
      "బెంగళూరు",
      "বেঙ্গালুরু",
      "பெங்களூரு",
      "ಬೆಂಗಳೂರು",
      "ബെംഗളൂരു",
    ],
  },
  {
    name: "Chennai",
    aliases: [
      "chennai",
      "चेन्नई",
      "చెన్నై",
      "চেন্নাই",
      "சென்னை",
      "ಚೆನ್ನೈ",
      "ചെന്നൈ",
    ],
  },
  {
    name: "Kolkata",
    aliases: [
      "kolkata",
      "कोलकाता",
      "కోల్‌కతా",
      "কলকাতা",
      "கொல்கத்தா",
      "ಕೋಲ್ಕತ್ತಾ",
      "കൊൽക്കത്ത",
    ],
  },
];

export function detectLanguage(
  message: string,
  requested?: string,
): WeatherLanguage {
  const supported: WeatherLanguage[] = [
    "en-IN",
    "hi-IN",
    "te-IN",
    "mr-IN",
    "bn-IN",
    "ta-IN",
    "kn-IN",
    "ml-IN",
  ];
  if (supported.includes(requested as WeatherLanguage))
    return requested as WeatherLanguage;
  if (/\p{Script=Telugu}/u.test(message)) return "te-IN";
  if (/\p{Script=Bengali}/u.test(message)) return "bn-IN";
  if (/\p{Script=Tamil}/u.test(message)) return "ta-IN";
  if (/\p{Script=Kannada}/u.test(message)) return "kn-IN";
  if (/\p{Script=Malayalam}/u.test(message)) return "ml-IN";
  if (/\p{Script=Devanagari}/u.test(message)) return "hi-IN";
  return "en-IN";
}

function extractLocation(message: string): string | null {
  const lower = message.toLocaleLowerCase();
  for (const location of LOCATIONS) {
    if (
      location.aliases.some((alias) =>
        lower.includes(alias.toLocaleLowerCase()),
      )
    )
      return location.name;
  }
  const match = message.match(
    /(?:in|at|near|for)\s+([a-z][a-z\s-]{1,45}?)(?=\s+(?:today|tomorrow|this|on|during|morning|afternoon|evening|night)|[?.!,]|$)/i,
  );
  return match?.[1]?.trim() || null;
}

export function parseWeatherIntent(
  message: string,
  requestedLanguage?: string,
): WeatherIntent {
  const lower = message.toLocaleLowerCase();
  const tomorrow =
    /\btomorrow\b|कल|రేపు|उद्या|আগামীকাল|কাল|நாளை|ನಾಳೆ|നാളെ/u.test(lower);
  let period: DayPeriod = "day";
  if (/morning|सुबह|ఉదయం|सकाळ|সকাল|காலை|ಬೆಳಿಗ್ಗೆ|രാവിലെ/u.test(lower))
    period = "morning";
  else if (
    /afternoon|दोपहर|మధ్యాహ్నం|दुपार|দুপুর|மதியம்|ಮಧ್ಯಾಹ್ನ|ഉച്ചയ്ക്ക്/u.test(
      lower,
    )
  )
    period = "afternoon";
  else if (
    /evening|शाम|సాయంత్రం|संध्याकाळ|সন্ধ্যা|மாலை|ಸಂಜೆ|വൈകുന്നേരം/u.test(lower)
  )
    period = "evening";
  else if (/night|रात|రాత్రి|रात्री|இரவு|രാത്രി/u.test(lower)) period = "night";
  else if (
    /current|right now|अभी|ఇప్పుడు|आत्ता|এখন|இப்போது|ಈಗ|ഇപ്പോൾ/u.test(lower)
  )
    period = "current";

  return {
    language: detectLanguage(message, requestedLanguage),
    locationQuery: extractLocation(message),
    dayOffset: tomorrow ? 1 : 0,
    period,
    advisoryType:
      /pesticide|spray|कीटनाशक|छिड़काव|कीटकनाशक|फवारणी|పురుగుమందు|స్ప్రే|কীটনাশক|স্প্রে|பூச்சிக்கொல்லி|தெளிப்பு|ಕೀಟನಾಶಕ|ಸಿಂಪಡಣೆ|കീടനാശിനി|തളിക്കുക/u.test(
        lower,
      )
        ? "pesticide_spray"
        : "general",
  };
}

const PERIOD_HOURS: Record<Exclude<DayPeriod, "current">, [number, number]> = {
  morning: [6, 11],
  afternoon: [12, 16],
  evening: [17, 20],
  night: [21, 23],
  day: [6, 21],
};

const round1 = (value: number) => Number(value.toFixed(1));
const average = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

export function summarizeForecast(
  data: WeatherData,
  intent: WeatherIntent,
): {
  date: string;
  startTime: string;
  endTime: string;
  evidence: WeatherEvidence;
} | null {
  if (intent.period === "current") {
    return {
      date: data.current.time.slice(0, 10),
      startTime: data.current.time,
      endTime: data.current.time,
      evidence: {
        temperatureC: data.current.temperature,
        apparentTemperatureC: data.current.apparentTemperature,
        humidityPercent: data.current.humidity,
        precipitationMm: data.current.precipitation,
        precipitationProbabilityPercent: 0,
        weatherCode: data.current.weatherCode,
        weatherDescription: data.current.weatherDescription,
        windSpeedKmh: data.current.windSpeed,
        windGustKmh: data.current.windGust,
        windDirectionDegrees: data.current.windDirection,
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

  const wettest = points.reduce((best, point) =>
    point.precipitationProbability > best.precipitationProbability
      ? point
      : best,
  );
  const strongestWind = points.reduce((best, point) =>
    point.windGust > best.windGust ? point : best,
  );
  const visible = points
    .map((point) => point.visibility)
    .filter((value): value is number => value != null);
  return {
    date,
    startTime: points[0].time,
    endTime: points[points.length - 1].time,
    evidence: {
      temperatureC: round1(average(points.map((point) => point.temperature))),
      apparentTemperatureC: round1(
        average(points.map((point) => point.apparentTemperature)),
      ),
      humidityPercent: Math.round(
        average(points.map((point) => point.humidity)),
      ),
      precipitationMm: round1(
        points.reduce((sum, point) => sum + point.precipitation, 0),
      ),
      precipitationProbabilityPercent: Math.max(
        ...points.map((point) => point.precipitationProbability),
      ),
      weatherCode: wettest.weatherCode,
      weatherDescription: wettest.weatherDescription,
      windSpeedKmh: round1(Math.max(...points.map((point) => point.windSpeed))),
      windGustKmh: round1(strongestWind.windGust),
      windDirectionDegrees: strongestWind.windDirection,
      visibilityMeters: visible.length ? Math.min(...visible) : null,
    },
  };
}

function recommendation(
  language: WeatherLanguage,
  risk: RiskLevel,
  spray: boolean,
): string {
  const text = {
    "en-IN": spray
      ? {
          high: "Do not spray pesticide in this forecast window.",
          moderate: "Postpone spraying if possible; conditions are marginal.",
          low: "Conditions are generally suitable for spraying, subject to local field conditions.",
        }
      : {
          high: "Use caution and adjust outdoor plans.",
          moderate: "Monitor conditions before extended outdoor activity.",
          low: "No major weather risk is indicated by this prototype rule set.",
        },
    "hi-IN": spray
      ? {
          high: "इस पूर्वानुमान अवधि में कीटनाशक का छिड़काव न करें।",
          moderate: "संभव हो तो छिड़काव टालें; परिस्थितियाँ सीमांत हैं।",
          low: "स्थानीय खेत की स्थिति के अनुसार छिड़काव सामान्यतः उपयुक्त है।",
        }
      : {
          high: "सावधानी रखें और बाहरी योजनाएँ बदलें।",
          moderate: "लंबी बाहरी गतिविधि से पहले मौसम देखें।",
          low: "प्रोटोटाइप नियमों में कोई बड़ा मौसम जोखिम नहीं मिला।",
        },
    "te-IN": spray
      ? {
          high: "ఈ అంచనా సమయంలో పురుగుమందు పిచికారీ చేయవద్దు.",
          moderate:
            "వీలైతే పిచికారీని వాయిదా వేయండి; పరిస్థితులు అనుకూలంగా లేవు.",
          low: "స్థానిక పొలం పరిస్థితులను బట్టి పిచికారీకి సాధారణంగా అనుకూలం.",
        }
      : {
          high: "జాగ్రత్తగా ఉండి బహిరంగ ప్రణాళికలను మార్చండి.",
          moderate: "ఎక్కువసేపు బయట ఉండే ముందు వాతావరణాన్ని పరిశీలించండి.",
          low: "ప్రోటోటైప్ నియమాల ప్రకారం ప్రధాన వాతావరణ ప్రమాదం కనిపించలేదు.",
        },
    "mr-IN": spray
      ? {
          high: "या अंदाज कालावधीत कीटकनाशक फवारणी करू नका.",
          moderate: "शक्य असल्यास फवारणी पुढे ढकला; परिस्थिती सीमांत आहे.",
          low: "स्थानिक शेत परिस्थितीनुसार फवारणीसाठी हवामान सामान्यतः योग्य आहे.",
        }
      : {
          high: "सावध रहा आणि मैदानी योजना बदला.",
          moderate: "दीर्घकाळ बाहेर राहण्यापूर्वी हवामान तपासा.",
          low: "प्रोटोटाइप नियमांनुसार मोठा हवामान धोका दिसत नाही.",
        },
    "bn-IN": spray
      ? {
          high: "এই পূর্বাভাস সময়ে কীটনাশক স্প্রে করবেন না।",
          moderate: "সম্ভব হলে স্প্রে স্থগিত করুন; পরিস্থিতি সীমান্তবর্তী।",
          low: "স্থানীয় ক্ষেতের অবস্থা অনুযায়ী স্প্রে করার পরিবেশ সাধারণত উপযুক্ত।",
        }
      : {
          high: "সতর্ক থাকুন এবং বাইরের পরিকল্পনা পরিবর্তন করুন।",
          moderate: "দীর্ঘ সময় বাইরে থাকার আগে আবহাওয়া দেখুন।",
          low: "প্রোটোটাইপ নিয়মে বড় কোনো আবহাওয়ার ঝুঁকি দেখা যায়নি।",
        },
    "ta-IN": spray
      ? {
          high: "இந்த முன்னறிவிப்பு நேரத்தில் பூச்சிக்கொல்லி தெளிக்க வேண்டாம்.",
          moderate:
            "முடிந்தால் தெளிப்பதை ஒத்திவைக்கவும்; நிலைமை சாதகமாக இல்லை.",
          low: "உள்ளூர் வயல் நிலவரத்தைப் பொறுத்து தெளிப்பதற்கு பொதுவாக ஏற்ற சூழல் உள்ளது.",
        }
      : {
          high: "எச்சரிக்கையாக இருந்து வெளிப்புறத் திட்டங்களை மாற்றவும்.",
          moderate:
            "நீண்ட நேர வெளிப்புற நடவடிக்கைக்கு முன் வானிலையைச் சரிபார்க்கவும்.",
          low: "முன்மாதிரி விதிகளின்படி பெரிய வானிலை அபாயம் இல்லை.",
        },
    "kn-IN": spray
      ? {
          high: "ಈ ಮುನ್ಸೂಚನೆ ಅವಧಿಯಲ್ಲಿ ಕೀಟನಾಶಕ ಸಿಂಪಡಿಸಬೇಡಿ.",
          moderate: "ಸಾಧ್ಯವಾದರೆ ಸಿಂಪಡಣೆಯನ್ನು ಮುಂದೂಡಿ; ಪರಿಸ್ಥಿತಿ ಅಂಚಿನಲ್ಲಿದೆ.",
          low: "ಸ್ಥಳೀಯ ಹೊಲದ ಪರಿಸ್ಥಿತಿಗೆ ಅನುಗುಣವಾಗಿ ಸಿಂಪಡಣೆಗೆ ಸಾಮಾನ್ಯವಾಗಿ ಸೂಕ್ತವಾಗಿದೆ.",
        }
      : {
          high: "ಎಚ್ಚರಿಕೆಯಿಂದಿರಿ ಮತ್ತು ಹೊರಾಂಗಣ ಯೋಜನೆಗಳನ್ನು ಬದಲಾಯಿಸಿ.",
          moderate: "ದೀರ್ಘ ಹೊರಾಂಗಣ ಚಟುವಟಿಕೆಗೆ ಮೊದಲು ಹವಾಮಾನ ಪರಿಶೀಲಿಸಿ.",
          low: "ಮಾದರಿ ನಿಯಮಗಳ ಪ್ರಕಾರ ಪ್ರಮುಖ ಹವಾಮಾನ ಅಪಾಯ ಕಾಣುತ್ತಿಲ್ಲ.",
        },
    "ml-IN": spray
      ? {
          high: "ഈ പ്രവചന സമയത്ത് കീടനാശിനി തളിക്കരുത്.",
          moderate:
            "സാധ്യമെങ്കിൽ തളിക്കൽ മാറ്റിവയ്ക്കുക; സാഹചര്യം അത്ര അനുകൂലമല്ല.",
          low: "പ്രാദേശിക വയൽ സാഹചര്യങ്ങൾക്കനുസരിച്ച് തളിക്കാൻ പൊതുവെ അനുയോജ്യമാണ്.",
        }
      : {
          high: "ജാഗ്രത പാലിച്ച് പുറത്തെ പദ്ധതികൾ മാറ്റുക.",
          moderate:
            "ദീർഘനേരം പുറത്തിരിക്കാനുള്ള പ്രവർത്തനത്തിന് മുമ്പ് കാലാവസ്ഥ പരിശോധിക്കുക.",
          low: "മാതൃകാ നിയമങ്ങൾ പ്രകാരം വലിയ കാലാവസ്ഥാ അപകടം കാണുന്നില്ല.",
        },
  } as const;
  return text[language][risk];
}

export function createAdvisory(
  intent: WeatherIntent,
  evidence: WeatherEvidence,
): AdvisoryResult {
  const rainRisk =
    evidence.precipitationProbabilityPercent >= 70 ||
    evidence.precipitationMm >= 7.5;
  const windRisk = evidence.windSpeedKmh >= 35 || evidence.windGustKmh >= 50;
  const heatRisk =
    evidence.temperatureC >= 40 || evidence.apparentTemperatureC >= 43;
  const dangerousCombination =
    [rainRisk, windRisk, heatRisk].filter(Boolean).length >= 2;
  let riskLevel: RiskLevel = "low";

  if (intent.advisoryType === "pesticide_spray") {
    if (
      evidence.precipitationProbabilityPercent >= 50 ||
      evidence.precipitationMm >= 1 ||
      evidence.windSpeedKmh >= 20 ||
      evidence.windGustKmh >= 30
    )
      riskLevel = "high";
    else if (
      evidence.precipitationProbabilityPercent >= 30 ||
      evidence.humidityPercent >= 85 ||
      evidence.windGustKmh >= 20
    )
      riskLevel = "moderate";
  } else if (
    dangerousCombination ||
    evidence.precipitationMm >= 20 ||
    evidence.windGustKmh >= 60 ||
    evidence.apparentTemperatureC >= 45
  ) {
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
    recommendation: recommendation(
      intent.language,
      riskLevel,
      intent.advisoryType === "pesticide_spray",
    ),
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
  if (intent.language === "mr-IN") {
    return `${location} येथे ${forecastWindow.date} (${intent.period}) साठी पावसाची कमाल शक्यता ${evidence.precipitationProbabilityPercent}% आणि अंदाजित पाऊस ${evidence.precipitationMm} मिमी आहे. वारा ${evidence.windSpeedKmh} किमी/तास आणि झोत ${evidence.windGustKmh} किमी/तास पर्यंत जाऊ शकतात. तापमान सुमारे ${evidence.temperatureC}°C राहील. ${advisory.recommendation}`;
  }
  if (intent.language === "bn-IN") {
    return `${location}-এ ${forecastWindow.date} (${intent.period}) সর্বোচ্চ বৃষ্টির সম্ভাবনা ${evidence.precipitationProbabilityPercent}% এবং পূর্বাভাসিত বৃষ্টি ${evidence.precipitationMm} মিমি। বাতাস ${evidence.windSpeedKmh} কিমি/ঘণ্টা এবং দমকা হাওয়া ${evidence.windGustKmh} কিমি/ঘণ্টা পর্যন্ত হতে পারে। তাপমাত্রা প্রায় ${evidence.temperatureC}°C। ${advisory.recommendation}`;
  }
  if (intent.language === "ta-IN") {
    return `${location}-இல் ${forecastWindow.date} (${intent.period}) அதிகபட்ச மழை வாய்ப்பு ${evidence.precipitationProbabilityPercent}%, முன்னறிவிக்கப்பட்ட மழை ${evidence.precipitationMm} மிமீ. காற்று ${evidence.windSpeedKmh} கிமீ/மணி மற்றும் காற்றடிப்பு ${evidence.windGustKmh} கிமீ/மணி வரை இருக்கலாம். வெப்பநிலை சுமார் ${evidence.temperatureC}°C. ${advisory.recommendation}`;
  }
  if (intent.language === "kn-IN") {
    return `${location}ನಲ್ಲಿ ${forecastWindow.date} (${intent.period}) ಗರಿಷ್ಠ ಮಳೆ ಸಾಧ್ಯತೆ ${evidence.precipitationProbabilityPercent}% ಮತ್ತು ಮುನ್ಸೂಚಿತ ಮಳೆ ${evidence.precipitationMm} ಮಿಮೀ. ಗಾಳಿ ${evidence.windSpeedKmh} ಕಿಮೀ/ಗಂ ಮತ್ತು ಗಾಳಿಯ ರಭಸ ${evidence.windGustKmh} ಕಿಮೀ/ಗಂ ವರೆಗೆ ಇರಬಹುದು. ತಾಪಮಾನ ಸುಮಾರು ${evidence.temperatureC}°C. ${advisory.recommendation}`;
  }
  if (intent.language === "ml-IN") {
    return `${location}ൽ ${forecastWindow.date} (${intent.period}) പരമാവധി മഴ സാധ്യത ${evidence.precipitationProbabilityPercent}%യും പ്രവചിച്ച മഴ ${evidence.precipitationMm} മില്ലിമീറ്ററും ആണ്. കാറ്റ് ${evidence.windSpeedKmh} കിമീ/മണിക്കൂറും ശക്തമായ കാറ്റ് ${evidence.windGustKmh} കിമീ/മണിക്കൂറും വരെ എത്താം. താപനില ഏകദേശം ${evidence.temperatureC}°C. ${advisory.recommendation}`;
  }
  return `For ${location} on ${forecastWindow.date} (${intent.period}), the maximum rain probability is ${evidence.precipitationProbabilityPercent}% with ${evidence.precipitationMm} mm forecast precipitation. Wind may reach ${evidence.windSpeedKmh} km/h with gusts up to ${evidence.windGustKmh} km/h. Temperature is about ${evidence.temperatureC}°C. ${advisory.recommendation}`;
}
