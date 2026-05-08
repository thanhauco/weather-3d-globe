"use client";

import { useEffect, useRef, useState } from "react";
import type { GeocodeResult } from "@/lib/types";

interface SearchBoxProps {
  onSelect: (place: GeocodeResult) => void;
  activeName?: string | null;
  onClear?: () => void;
}

export default function SearchBox({ onSelect, activeName, onClear }: SearchBoxProps) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced geocoding lookup.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const seq = ++seqRef.current;
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(term)}`);
        const j = await r.json();
        if (seq !== seqRef.current) return;
        setResults(j.results || []);
        setOpen(true);
        setHighlight(0);
      } catch {
        if (seq === seqRef.current) setResults([]);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, 220);
  }, [q]);

  // Close dropdown on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(r: GeocodeResult) {
    onSelect(r);
    setQ("");
    setResults([]);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[highlight];
      if (r) choose(r);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="pointer-events-auto relative w-[320px] max-w-[80vw]">
      <div className="glass flex items-center gap-2 rounded-full px-3 py-2">
        <span className="text-slate-400">🔍</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Search any place on Earth…"
          className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />
        {loading && <span className="text-xs text-slate-500">…</span>}
      </div>

      {activeName && (
        <button
          onClick={onClear}
          className="glass mt-2 flex w-full items-center justify-between rounded-full px-3 py-1.5 text-xs text-slate-200 hover:text-white"
        >
          <span className="truncate">📍 {activeName}</span>
          <span className="text-slate-400">✕ clear</span>
        </button>
      )}

      {open && results.length > 0 && (
        <ul className="glass absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-auto rounded-xl py-1">
          {results.map((r, i) => (
            <li key={`${r.id}-${i}`}>
              <button
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(r)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                  i === highlight ? "bg-white/10 text-white" : "text-slate-200"
                }`}
              >
                <span className="truncate">
                  <span className="font-medium">{r.name}</span>
                  {r.admin1 && <span className="text-slate-400">, {r.admin1}</span>}
                </span>
                <span className="shrink-0 text-xs text-slate-400">{r.country}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
