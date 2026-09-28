import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CloudSun,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";

type Language = "en-IN" | "hi-IN" | "te-IN";
type RiskLevel = "low" | "moderate" | "high";
type ChatMode = "weather" | "agent";

interface WeatherReply {
  answer: string;
  language: Language;
  location: { label: string; lat: number; lng: number };
  forecastWindow: { date: string; startTime: string; endTime: string; timezone: string };
  evidence: {
    temperatureC: number;
    apparentTemperatureC: number;
    humidityPercent: number;
    precipitationMm: number;
    precipitationProbabilityPercent: number;
    weatherDescription: string;
    windSpeedKmh: number;
    windGustKmh: number;
    windDirectionDegrees: number;
    visibilityMeters: number | null;
  };
  advisory: {
    riskLevel: RiskLevel;
    recommendation: string;
    explanation: string;
    prototypeLogic: true;
  };
  provenance: { provider: string; model: string; access: string; retrievedAt: string };
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  reply?: WeatherReply;
  language: Language;
  isError?: boolean;
  provider?: string;
  model?: string;
}

interface SpeechResultEvent {
  results: { [key: number]: { [key: number]: { transcript: string } } };
}
interface SpeechErrorEvent { error: string }
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const API_BASE = import.meta.env.VITE_BACKEND_URL || "";

const LANGUAGES: Array<{ value: Language; label: string }> = [
  { value: "en-IN", label: "English" },
  { value: "hi-IN", label: "हिन्दी" },
  { value: "te-IN", label: "తెలుగు" },
];

const COPY: Record<Language, {
  welcome: string;
  placeholder: string;
  suggestion: string;
  listening: string;
  agentWelcome: string;
  agentPlaceholder: string;
}> = {
  "en-IN": {
    welcome: "Ask me about weather for any Indian city, district, village, or town — any location works. Every forecast uses NOAA GFS data and shows its source.",
    placeholder: "Ask about weather or farm activity — any location…",
    suggestion: "Tomorrow's weather in Nizamabad district?",
    listening: "Listening…",
    agentWelcome: "I'm AEGIS AI — your disaster response assistant. Ask me about evacuation routes, risk assessments, field reports, or any situation.",
    agentPlaceholder: "Ask AEGIS AI anything…",
  },
  "hi-IN": {
    welcome: "भारत के किसी भी शहर, जिले, गांव या कस्बे के मौसम के बारे में पूछें — हर स्थान के लिए काम करता है।",
    placeholder: "मौसम या खेती के बारे में पूछें — कोई भी स्थान…",
    suggestion: "कल निजामाबाद में बारिश होगी क्या?",
    listening: "सुन रहा हूँ…",
    agentWelcome: "मैं AEGIS AI हूँ — आपका आपदा प्रतिक्रिया सहायक।",
    agentPlaceholder: "AEGIS AI से कुछ भी पूछें…",
  },
  "te-IN": {
    welcome: "భారతదేశంలోని ఏ నగరం, జిల్లా, గ్రామం లేదా పట్టణం వాతావరణం గురించైనా అడగండి — ఎక్కడైనా పని చేస్తుంది.",
    placeholder: "వాతావరణం లేదా వ్యవసాయం గురించి అడగండి — ఏ ప్రదేశమైనా…",
    suggestion: "రేపు నిజామాబాద్‌లో వాతావరణం ఎలా ఉంటుంది?",
    listening: "వింటున్నాను…",
    agentWelcome: "నేను AEGIS AI — మీ విపత్తు స్పందన సహాయకుడు.",
    agentPlaceholder: "AEGIS AI ని ఏదైనా అడగండి…",
  },
};

// Language name map for the system prompt instruction
const LANGUAGE_NAMES: Record<Language, string> = {
  "en-IN": "English",
  "hi-IN": "Hindi (हिन्दी)",
  "te-IN": "Telugu (తెలుగు)",
};

// Build a language-aware AEGIS AI system prompt
function buildAgentSystem(lang: Language): string {
  const langName = LANGUAGE_NAMES[lang];
  return `You are AEGIS AI, an advanced disaster response and crisis management assistant integrated into the AEGIS real-time disaster monitoring platform. You help emergency responders, relief coordinators, and field agents with:
- Evacuation route planning and logistics
- Risk assessment and prioritization
- Field report interpretation
- Resource allocation recommendations
- Multi-hazard scenario analysis (floods, earthquakes, landslides, fires, cyclones)
- Communication strategies for affected populations

IMPORTANT: You MUST respond EXCLUSIVELY in ${langName}. Do NOT switch to any other language regardless of the topic. Every word of your response must be in ${langName}.

Keep responses concise, actionable, and prioritize life-safety information. When discussing specific locations in India, be aware of regional geography and infrastructure. Always indicate when information may need real-time verification.`;
}

// Fallback messages per language when the LLM gives no content
const FALLBACK_REPLY: Record<Language, string> = {
  "en-IN": "I could not generate a response right now. Please try again.",
  "hi-IN": "अभी उत्तर देना संभव नहीं हुआ। कृपया पुनः प्रयास करें।",
  "te-IN": "ఇప్పుడు సమాధానం ఇవ్వడం సాధ్యం కాలేదు. దయచేసి మళ్ళీ ప్రయత్నించండి.",
};

// Detect language from text content (for auto-switching when user types in a different script)
function detectScriptLanguage(text: string): Language | null {
  if (/\p{Script=Telugu}/u.test(text)) return "te-IN";
  if (/\p{Script=Devanagari}/u.test(text)) return "hi-IN";
  return null;
}

function speechConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

function riskClasses(risk: RiskLevel): string {
  if (risk === "high") return "border-rose-400/30 bg-rose-400/10 text-rose-200";
  if (risk === "moderate") return "border-amber-400/30 bg-amber-400/10 text-amber-200";
  return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
}

// ──────────────────────────────────────────────────────────────────────────────
// Voice hooks
// ──────────────────────────────────────────────────────────────────────────────
function useSpeechRecognition(language: Language, onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const supported = useMemo(() => speechConstructor() !== null, []);

  const start = useCallback(() => {
    const Recognition = speechConstructor();
    if (!Recognition) {
      setVoiceNotice("Speech recognition is not supported in this browser. Typing remains available.");
      return;
    }
    try {
      recognitionRef.current?.stop();
      const recognition = new Recognition();
      recognition.lang = language;
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript?.trim();
        if (transcript) onTranscript(transcript);
      };
      recognition.onerror = (event) => {
        const denied = event.error === "not-allowed" || event.error === "service-not-allowed";
        setVoiceNotice(
          denied
            ? "Microphone permission was denied. Enable it in browser settings or type your question."
            : `Speech recognition failed (${event.error}). You can still type your question.`,
        );
        setListening(false);
      };
      recognition.onend = () => setListening(false);
      recognitionRef.current = recognition;
      setListening(true);
      setVoiceNotice(null);
      recognition.start();
    } catch {
      setListening(false);
      setVoiceNotice("Could not start speech recognition. Typing remains available.");
    }
  }, [language, onTranscript]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  return { listening, voiceNotice, supported, start, stop, clearNotice: () => setVoiceNotice(null) };
}

function useSpeechSynthesis() {
  const [speaking, setSpeaking] = useState(false);
  const [supported] = useState(() => typeof window !== "undefined" && "speechSynthesis" in window);

  const speak = useCallback((text: string, lang: Language) => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 1.05; // Slightly faster for snappy responses
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [supported]);

  const cancel = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  return { speak, cancel, speaking, supported };
}

// ──────────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────────
export function AgentChatBox() {
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState<ChatMode>("weather");
  const [language, setLanguage] = useState<Language>("en-IN");
  const [input, setInput] = useState("");

  // Auto-detect language from what the user types and switch if needed
  const handleInputChange = useCallback((value: string) => {
    setInput(value);
    const detected = detectScriptLanguage(value);
    if (detected) setLanguage(detected);
  }, []);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [agentMessages, setAgentMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Provider tag for last response
  const [lastProvider, setLastProvider] = useState<string | null>(null);

  const tts = useSpeechSynthesis();

  const handleTranscript = useCallback((transcript: string) => {
    setInput(transcript);
    // Auto-submit after short delay to feel instant
    setTimeout(() => submitText(transcript), 100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stt = useSpeechRecognition(language, handleTranscript);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, agentMessages, loading]);

  const currentMessages = mode === "weather" ? messages : agentMessages;
  const setCurrentMessages = mode === "weather" ? setMessages : setAgentMessages;

  // ── Weather submit ──
  async function submitWeather(text: string, activeLang: Language) {
    const response = await fetch(`${API_BASE}/api/weather-gpt/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, language: activeLang }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Current forecast data is unavailable.");
    const reply = data as WeatherReply;
    const assistantText = reply.answer;
    setCurrentMessages((cur) => [
      ...cur,
      {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: assistantText,
        language: reply.language,
        reply,
      },
    ]);
    // Auto-speak the answer
    tts.speak(assistantText, reply.language);
  }

  // ── Agent submit ──
  async function submitAgent(text: string, historyMessages: ChatMessage[], activeLang: Language) {
    // Build conversation history for the LLM
    const llmMessages = historyMessages.slice(-10).map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.text,
    }));
    llmMessages.push({ role: "user", content: text });

    // Build language-specific system prompt so the LLM always replies in the user's language
    const systemPrompt = buildAgentSystem(activeLang);

    const response = await fetch(`${API_BASE}/api/chat/auto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: llmMessages,
        system: systemPrompt,
        max_tokens: 700,
        temperature: 0.65,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || FALLBACK_REPLY[activeLang]);

    const assistantText: string =
      data.choices?.[0]?.message?.content ??
      data.choices?.[0]?.text ??
      FALLBACK_REPLY[activeLang];

    const providerTag = data._provider ?? null;
    const modelTag = data._model ?? null;
    setLastProvider(providerTag);

    setCurrentMessages((cur) => [
      ...cur,
      {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: assistantText,
        language: activeLang,
        provider: providerTag ?? undefined,
        model: modelTag ?? undefined,
      },
    ]);
    // Auto-speak the answer
    tts.speak(assistantText, activeLang);
  }

  // ── Common submit ──
  async function submitText(rawText?: string) {
    const text = (rawText ?? input).trim();
    if (!text || loading) return;

    // Detect language from the submitted text itself (covers voice input too)
    const detectedLang = detectScriptLanguage(text);
    const activeLang: Language = detectedLang ?? language;
    if (detectedLang && detectedLang !== language) setLanguage(detectedLang);

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text,
      language: activeLang,
    };
    // Capture history before state update
    const historyBefore = [...currentMessages];

    setCurrentMessages((cur) => [...cur, userMsg]);
    setInput("");
    setLoading(true);
    stt.clearNotice();
    tts.cancel();

    try {
      if (mode === "weather") {
        await submitWeather(text, activeLang);
      } else {
        await submitAgent(text, historyBefore, activeLang);
      }
    } catch (error) {
      setCurrentMessages((cur) => [
        ...cur,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          text: error instanceof Error ? error.message : FALLBACK_REPLY[activeLang],
          language: activeLang,
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // ── Mic button toggle ──
  const toggleMic = () => {
    if (stt.listening) {
      stt.stop();
    } else {
      stt.start();
    }
  };

  // ── Speak a specific message ──
  const speakMessage = (msg: ChatMessage) => {
    if (tts.speaking) { tts.cancel(); return; }
    tts.speak(msg.text, msg.language);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open AEGIS AI"
        className="pointer-events-auto fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-emerald-500 text-white shadow-[0_0_30px_rgba(56,189,248,0.45)] transition-transform hover:scale-105"
      >
        <MessageSquare className="h-6 w-6" />
      </button>
    );
  }

  const copy = COPY[language];
  const isWeather = mode === "weather";

  return (
    <section className="pointer-events-auto fixed bottom-4 right-4 z-50 flex h-[min(720px,calc(100dvh-2rem))] w-[min(460px,calc(100vw-2rem))] min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#07101d]/95 text-white shadow-2xl backdrop-blur-xl max-sm:inset-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-screen max-sm:rounded-none max-sm:border-0">
      {/* ── Header ── */}
      <header className="shrink-0 border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-400/15 ring-1 ring-sky-300/20">
              {isWeather ? <CloudSun className="h-5 w-5 text-sky-300" /> : <Bot className="h-5 w-5 text-emerald-300" />}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">
                {isWeather ? "WeatherGPT India" : "AEGIS AI Agent"}
              </h2>
              <p className="flex items-center gap-1 text-[10px]">
                {isWeather
                  ? <span className="text-emerald-300/80">Grounded forecast · NOAA GFS</span>
                  : (
                    <span className="text-sky-300/80 flex items-center gap-1">
                      <Zap className="h-3 w-3" />
                      {lastProvider === "google" ? "Gemini 2.5 Flash" : lastProvider === "openrouter" ? "Ling 3.0 Flash" : "Google AI Studio → OpenRouter"}
                    </span>
                  )
                }
              </p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close chat"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white/60 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode tabs + language */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex rounded-xl border border-white/10 bg-white/[0.04] p-0.5">
            <button
              onClick={() => setMode("weather")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${isWeather ? "bg-sky-500/25 text-sky-200" : "text-white/45 hover:text-white/70"}`}
            >
              🌤 Weather
            </button>
            <button
              onClick={() => setMode("agent")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${!isWeather ? "bg-emerald-500/25 text-emerald-200" : "text-white/45 hover:text-white/70"}`}
            >
              🤖 AEGIS AI
            </button>
          </div>
          <select
            id="weather-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            className="h-8 flex-1 rounded-xl border border-white/10 bg-white/5 px-2 text-xs text-white outline-none focus:border-sky-400/50"
          >
            {LANGUAGES.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-slate-900">{opt.label}</option>
            ))}
          </select>
        </div>
      </header>

      {/* ── Messages ── */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {/* Welcome banner */}
        <div className="rounded-2xl border border-sky-400/15 bg-sky-400/5 p-3 text-xs leading-relaxed text-white/70">
          {isWeather ? copy.welcome : copy.agentWelcome}
        </div>

        {currentMessages.map((msg) => (
          <article key={msg.id} className={msg.role === "user" ? "ml-10" : "mr-2"}>
            <div
              className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "rounded-br-md bg-sky-500/20 text-white"
                  : msg.isError
                    ? "rounded-bl-md border border-rose-400/25 bg-rose-400/10 text-rose-100"
                    : "rounded-bl-md border border-white/10 bg-white/[0.04] text-white/85"
              }`}
            >
              {msg.isError && <AlertTriangle className="mb-2 h-4 w-4 text-rose-300" />}
              <p className="whitespace-pre-wrap">{msg.text}</p>

              {/* Speak / Stop button */}
              {msg.role === "assistant" && !msg.isError && (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => speakMessage(msg)}
                    aria-label={tts.speaking ? "Stop speaking" : "Speak response"}
                    className="flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs text-sky-200 hover:bg-white/10"
                  >
                    {tts.speaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                    {tts.speaking ? "Stop" : "Speak"}
                  </button>
                  {/* Provider badge for agent mode */}
                  {msg.provider && (
                    <span className="ml-auto rounded-full bg-white/5 px-2 py-0.5 text-[9px] text-white/30">
                      {msg.provider === "google" ? "⚡ Gemini 2.5 Flash" : "🔀 Ling 3.0 Flash"}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Weather evidence card */}
            {msg.reply && (
              <div className="mt-2 space-y-2 rounded-2xl border border-white/10 bg-black/25 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${riskClasses(msg.reply.advisory.riskLevel)}`}>
                    {msg.reply.advisory.riskLevel} risk
                  </span>
                  <span className="text-[10px] text-white/40">Prototype advisory logic</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-white/[0.04] p-2">
                    <span className="block text-[9px] uppercase text-white/35">Rain</span>
                    {msg.reply.evidence.precipitationProbabilityPercent}% · {msg.reply.evidence.precipitationMm} mm
                  </div>
                  <div className="rounded-xl bg-white/[0.04] p-2">
                    <span className="block text-[9px] uppercase text-white/35">Wind / gust</span>
                    {msg.reply.evidence.windSpeedKmh} / {msg.reply.evidence.windGustKmh} km/h
                  </div>
                  <div className="rounded-xl bg-white/[0.04] p-2">
                    <span className="block text-[9px] uppercase text-white/35">Temperature</span>
                    {msg.reply.evidence.temperatureC}°C · feels {msg.reply.evidence.apparentTemperatureC}°C
                  </div>
                  <div className="rounded-xl bg-white/[0.04] p-2">
                    <span className="block text-[9px] uppercase text-white/35">Humidity</span>
                    {msg.reply.evidence.humidityPercent}%
                  </div>
                </div>
                <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-2.5 text-[11px] leading-relaxed text-white/60">
                  <div><span className="text-white/35">Location:</span> {msg.reply.location.label}</div>
                  <div><span className="text-white/35">Forecast:</span> {msg.reply.forecastWindow.startTime.replace("T", " ")}–{msg.reply.forecastWindow.endTime.split("T")[1]} ({msg.reply.forecastWindow.timezone})</div>
                  <div><span className="text-white/35">Model:</span> NOAA NCEP {msg.reply.provenance.model}</div>
                  <div><span className="text-white/35">Retrieved:</span> {new Date(msg.reply.provenance.retrievedAt).toLocaleString()}</div>
                </div>
              </div>
            )}
          </article>
        ))}

        {loading && (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-white/45">
            <Loader2 className="h-4 w-4 animate-spin text-sky-300" />
            {isWeather ? "Retrieving NOAA GFS forecast…" : "AEGIS AI is thinking…"}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <footer className="shrink-0 border-t border-white/10 bg-black/20 p-3 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {/* Voice notice */}
        {stt.voiceNotice && (
          <p className="mb-2 rounded-lg bg-amber-400/10 px-3 py-2 text-[11px] text-amber-100">
            {stt.voiceNotice}
          </p>
        )}

        {/* Suggestion chip (only when no messages) */}
        {currentMessages.length === 0 && isWeather && (
          <button
            onClick={() => setInput(copy.suggestion)}
            className="mb-2 min-h-11 w-full rounded-xl border border-white/10 px-3 text-left text-xs text-white/55 hover:bg-white/5"
          >
            {copy.suggestion}
          </button>
        )}

        {/* Listening animation bar */}
        {stt.listening && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2">
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="w-0.5 rounded-full bg-rose-300"
                  style={{
                    height: `${8 + Math.random() * 12}px`,
                    animation: `pulse 0.${6 + i}s ease-in-out infinite alternate`,
                  }}
                />
              ))}
            </div>
            <span className="text-xs text-rose-200">{copy.listening}</span>
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Mic button */}
          <button
            onClick={toggleMic}
            aria-label={stt.listening ? "Stop listening" : stt.supported ? "Speak question" : "Speech recognition unsupported"}
            title={stt.supported ? (stt.listening ? "Stop listening" : "Voice input (fast)") : "Speech not supported in this browser"}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all ${
              stt.listening
                ? "border-rose-400 bg-rose-400/20 text-rose-200 shadow-[0_0_12px_rgba(248,113,113,0.3)]"
                : "border-white/10 bg-white/5 text-white/65 hover:bg-white/10 hover:text-white"
            }`}
          >
            {stt.listening
              ? <MicOff className="h-5 w-5" />
              : <Mic className="h-5 w-5" />
            }
          </button>

          {/* Text input */}
          <textarea
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submitText();
              }
            }}
            rows={2}
            placeholder={stt.listening ? copy.listening : (isWeather ? copy.placeholder : copy.agentPlaceholder)}
            className="min-h-11 flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-sky-400/50"
          />

          {/* Send button */}
          <button
            onClick={() => void submitText()}
            disabled={!input.trim() || loading}
            aria-label="Send message"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500/25 text-sky-100 hover:bg-sky-500/40 disabled:opacity-35"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>

        {/* Provider status bar */}
        {!isWeather && (
          <p className="mt-2 text-center text-[10px] text-white/20">
            ⚡ Primary: Gemini 2.5 Flash (Google AI Studio) · 🔀 Fallback: Ling 3.0 Flash (OpenRouter)
          </p>
        )}
      </footer>
    </section>
  );
}
