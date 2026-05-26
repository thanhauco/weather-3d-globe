"use client";

import { useState } from "react";
import type { PlaceSnapshot } from "@/lib/types";

interface WeatherAskBoxProps {
  at: Date;
  place: PlaceSnapshot | null;
}

interface AskSource {
  label: string;
  url: string;
}

interface AskResponse {
  answer?: string;
  error?: string;
  place?: {
    name: string;
    country: string;
    admin1: string;
  } | null;
  sources?: AskSource[];
}

export default function WeatherAskBox({ at, place }: WeatherAskBoxProps) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask() {
    const trimmed = question.trim();
    if (trimmed.length < 3 || loading) return;
    setLoading(true);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          at: at.toISOString(),
          place: place
            ? {
                name: place.name,
                country: place.country,
                admin1: place.admin1,
                lat: place.lat,
                lon: place.lon,
              }
            : null,
        }),
      });
      const data = (await response.json()) as AskResponse;
      setAnswer(data);
    } catch {
      setAnswer({ error: "Could not answer that question right now." });
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      ask();
    }
  }

  const sourceList = (answer?.sources || []).filter((source) => source.url);
  const resolvedPlace = answer?.place
    ? [answer.place.name, answer.place.admin1, answer.place.country]
        .filter(Boolean)
        .join(", ")
    : null;

  return (
    <div className="pointer-events-auto mt-3 w-[460px] max-w-[90vw]">
      <div className="glass rounded-2xl p-3 shadow-2xl">
        <div className="flex items-end gap-2">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder="Ask a weather question, e.g. why does Seattle get so much rain?"
            className="min-h-[44px] flex-1 resize-none bg-transparent text-sm leading-5 text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          <button
            onClick={ask}
            disabled={loading || question.trim().length < 3}
            className="rounded-full bg-sky-500 px-3 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-sky-500/20 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
          >
            {loading ? "Thinking" : "Ask"}
          </button>
        </div>

        {answer && (
          <div className="mt-3 rounded-xl border border-slate-800/80 bg-slate-950/70 p-3 text-xs leading-5 text-slate-200">
            {resolvedPlace && (
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-sky-300">
                {resolvedPlace}
              </div>
            )}
            <div className="whitespace-pre-wrap">
              {answer.answer || answer.error || "No answer returned."}
            </div>
            {sourceList.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-800 pt-2">
                {sourceList.slice(0, 4).map((source, index) => (
                  <a
                    key={`${source.url}-${index}`}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300 transition hover:border-sky-400 hover:text-sky-200"
                  >
                    {source.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}