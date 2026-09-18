import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CloudSun,
  Loader2,
  MessageSquare,
  Mic,
  Send,
  Volume2,
  X,
} from "lucide-react";

type Language = "en-IN" | "hi-IN" | "te-IN";
type RiskLevel = "low" | "moderate" | "high";

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
}

interface SpeechResultEvent {
  results: { [key: number]: { [key: number]: { transcript: string } } };
}
interface SpeechErrorEvent {
  error: string;
}
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
const COPY: Record<
  Language,
  { welcome: string; placeholder: string; suggestion: string; listening: string }
> = {
  "en-IN": {
    welcome:
      "Ask me about current or upcoming weather in an Indian city. Every forecast answer uses NOAA GFS data and shows its source.",
    placeholder: "Ask about weather or farm activity…",
    suggestion: "Will it rain in Hyderabad tomorrow evening?",
    listening: "Listening…",
  },
  "hi-IN": {
    welcome:
      "भारत के किसी शहर के वर्तमान या आगामी मौसम के बारे में पूछें। हर उत्तर NOAA GFS डेटा पर आधारित है।",
    placeholder: "मौसम या खेती के बारे में पूछें…",
    suggestion: "कल हैदराबाद में बारिश होगी क्या?",
    listening: "सुन रहा हूँ…",
  },
  "te-IN": {
    welcome:
      "భారతదేశంలోని నగర వాతావరణం గురించి అడగండి. ప్రతి సమాధానం NOAA GFS డేటాపై ఆధారపడి ఉంటుంది.",
    placeholder: "వాతావరణం లేదా వ్యవసాయం గురించి అడగండి…",
    suggestion: "రేపు హైదరాబాద్‌లో వర్షం పడుతుందా?",
    listening: "వింటున్నాను…",
  },
};

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

export function AgentChatBox() {
  const [open, setOpen] = useState(true);
  const [language, setLanguage] = useState<Language>("en-IN");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechSupported = useMemo(() => speechConstructor() !== null, []);

  const submit = async (rawText?: string) => {
    const text = (rawText ?? input).trim();
    if (!text || loading) return;
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text,
      language,
    };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setLoading(true);
    setVoiceNotice(null);
    try {
      const response = await fetch(`${API_BASE}/api/weather-gpt/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, language }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Current forecast data is unavailable.");
      const reply = data as WeatherReply;
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: reply.answer,
          language: reply.language,
          reply,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          text: error instanceof Error ? error.message : "Current forecast data is unavailable.",
          language,
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const startListening = () => {
    const Recognition = speechConstructor();
    if (!Recognition) {
      setVoiceNotice(
        "Speech recognition is not supported in this browser. Typing remains available.",
      );
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
        if (transcript) {
          setInput(transcript);
          void submit(transcript);
        }
      };
      recognition.onerror = (event) => {
        const denied = event.error === "not-allowed" || event.error === "service-not-allowed";
        setVoiceNotice(
          denied
            ? "Microphone permission was denied. Enable it in browser settings or type your question."
            : `Speech recognition failed (${event.error}). You can still type your question.`,
        );
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
  };

  const speak = (message: ChatMessage) => {
    if (!("speechSynthesis" in window)) {
      setVoiceNotice("Speech output is not supported in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message.text);
    utterance.lang = message.language;
    window.speechSynthesis.speak(utterance);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open WeatherGPT"
        className="pointer-events-auto fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-emerald-500 text-white shadow-[0_0_30px_rgba(56,189,248,0.45)] transition-transform hover:scale-105"
      >
        <MessageSquare className="h-6 w-6" />
      </button>
    );
  }

  return (
    <section className="pointer-events-auto fixed bottom-4 right-4 z-50 flex h-[min(680px,calc(100dvh-2rem))] w-[min(430px,calc(100vw-2rem))] min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#07101d]/95 text-white shadow-2xl backdrop-blur-xl max-sm:inset-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-screen max-sm:rounded-none max-sm:border-0">
      <header className="shrink-0 border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-400/15 ring-1 ring-sky-300/20">
              <CloudSun className="h-5 w-5 text-sky-300" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">WeatherGPT India</h2>
              <p className="text-[10px] text-emerald-300/80">Grounded forecast mode</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close WeatherGPT"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white/60 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <label
            htmlFor="weather-language"
            className="text-[10px] font-medium uppercase tracking-wider text-white/40"
          >
            Language
          </label>
          <select
            id="weather-language"
            value={language}
            onChange={(event) => setLanguage(event.target.value as Language)}
            className="h-11 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-sky-400/50"
          >
            {LANGUAGES.map((option) => (
              <option key={option.value} value={option.value} className="bg-slate-900">
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <div className="rounded-2xl border border-sky-400/15 bg-sky-400/5 p-3 text-xs leading-relaxed text-white/70">
          {COPY[language].welcome}
        </div>
        {messages.map((message) => (
          <article key={message.id} className={message.role === "user" ? "ml-10" : "mr-2"}>
            <div
              className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                message.role === "user"
                  ? "rounded-br-md bg-sky-500/20 text-white"
                  : message.isError
                    ? "rounded-bl-md border border-rose-400/25 bg-rose-400/10 text-rose-100"
                    : "rounded-bl-md border border-white/10 bg-white/[0.04] text-white/85"
              }`}
            >
              {message.isError && <AlertTriangle className="mb-2 h-4 w-4 text-rose-300" />}
              <p className="whitespace-pre-wrap">{message.text}</p>
              {message.role === "assistant" && !message.isError && (
                <button
                  onClick={() => speak(message)}
                  aria-label="Speak response"
                  className="mt-2 flex h-11 items-center gap-2 rounded-xl px-3 text-xs text-sky-200 hover:bg-white/10"
                >
                  <Volume2 className="h-4 w-4" /> Speak
                </button>
              )}
            </div>

            {message.reply && (
              <div className="mt-2 space-y-2 rounded-2xl border border-white/10 bg-black/25 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${riskClasses(message.reply.advisory.riskLevel)}`}
                  >
                    {message.reply.advisory.riskLevel} risk
                  </span>
                  <span className="text-[10px] text-white/40">Prototype advisory logic</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-white/[0.04] p-2">
                    <span className="block text-[9px] uppercase text-white/35">Rain</span>
                    {message.reply.evidence.precipitationProbabilityPercent}% ·{" "}
                    {message.reply.evidence.precipitationMm} mm
                  </div>
                  <div className="rounded-xl bg-white/[0.04] p-2">
                    <span className="block text-[9px] uppercase text-white/35">Wind / gust</span>
                    {message.reply.evidence.windSpeedKmh} / {message.reply.evidence.windGustKmh}{" "}
                    km/h
                  </div>
                  <div className="rounded-xl bg-white/[0.04] p-2">
                    <span className="block text-[9px] uppercase text-white/35">Temperature</span>
                    {message.reply.evidence.temperatureC}°C · feels{" "}
                    {message.reply.evidence.apparentTemperatureC}°C
                  </div>
                  <div className="rounded-xl bg-white/[0.04] p-2">
                    <span className="block text-[9px] uppercase text-white/35">Humidity</span>
                    {message.reply.evidence.humidityPercent}%
                  </div>
                </div>
                <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-2.5 text-[11px] leading-relaxed text-white/60">
                  <div>
                    <span className="text-white/35">Location:</span> {message.reply.location.label}
                  </div>
                  <div>
                    <span className="text-white/35">Forecast:</span>{" "}
                    {message.reply.forecastWindow.startTime.replace("T", " ")}–
                    {message.reply.forecastWindow.endTime.split("T")[1]} (
                    {message.reply.forecastWindow.timezone})
                  </div>
                  <div>
                    <span className="text-white/35">Model:</span> NOAA NCEP{" "}
                    {message.reply.provenance.model}
                  </div>
                  <div>
                    <span className="text-white/35">Access:</span> via Open-Meteo
                  </div>
                  <div>
                    <span className="text-white/35">Retrieved:</span>{" "}
                    {new Date(message.reply.provenance.retrievedAt).toLocaleString()}
                  </div>
                </div>
              </div>
            )}
          </article>
        ))}
        {loading && (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-white/45">
            <Loader2 className="h-4 w-4 animate-spin text-sky-300" /> Retrieving NOAA GFS forecast…
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-white/10 bg-black/20 p-3 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {voiceNotice && (
          <p className="mb-2 rounded-lg bg-amber-400/10 px-3 py-2 text-[11px] text-amber-100">
            {voiceNotice}
          </p>
        )}
        {messages.length === 0 && (
          <button
            onClick={() => setInput(COPY[language].suggestion)}
            className="mb-2 min-h-11 w-full rounded-xl border border-white/10 px-3 text-left text-xs text-white/55 hover:bg-white/5"
          >
            {COPY[language].suggestion}
          </button>
        )}
        <div className="flex items-end gap-2">
          <button
            onClick={startListening}
            aria-label={
              speechSupported ? "Speak weather question" : "Speech recognition unsupported"
            }
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${listening ? "border-rose-400 bg-rose-400/15 text-rose-200" : "border-white/10 bg-white/5 text-white/65 hover:bg-white/10"}`}
          >
            {listening ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
          </button>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            rows={2}
            placeholder={listening ? COPY[language].listening : COPY[language].placeholder}
            className="min-h-11 flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-sky-400/50"
          />
          <button
            onClick={() => void submit()}
            disabled={!input.trim() || loading}
            aria-label="Send weather question"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500/25 text-sky-100 hover:bg-sky-500/40 disabled:opacity-35"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </footer>
    </section>
  );
}
