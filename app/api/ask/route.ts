import { NextRequest, NextResponse } from "next/server";
import { fetchOpenMeteo } from "@/lib/openMeteo";
import type { GeocodeResult, PlaceSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

interface AskRequestBody {
  question?: string;
  at?: string;
  place?: Pick<PlaceSnapshot, "name" | "country" | "admin1" | "lat" | "lon"> | null;
}

interface WebContext {
  title: string;
  text: string;
  url: string;
}

const STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "around",
  "because",
  "does",
  "forecast",
  "have",
  "has",
  "heavy",
  "into",
  "lots",
  "much",
  "rain",
  "raining",
  "rainy",
  "snow",
  "storm",
  "temperature",
  "today",
  "tomorrow",
  "weather",
  "what",
  "when",
  "where",
  "which",
  "while",
  "wind",
  "with",
  "why",
]);

export async function POST(req: NextRequest) {
  let body: AskRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const question = body.question?.trim().slice(0, 700) || "";
  if (question.length < 3) {
    return NextResponse.json(
      { error: "Ask a weather question first." },
      { status: 400 }
    );
  }

  const at = body.at ? new Date(body.at) : new Date();
  if (Number.isNaN(at.getTime())) {
    return NextResponse.json({ error: "Invalid timestamp" }, { status: 400 });
  }

  const place = normalizePlace(body.place) ?? (await inferPlace(question));
  const weather = place ? await fetchOpenMeteo(place.lat, place.lon, at) : null;
  const web = await fetchWebContext(question, place);
  const aiAnswer = await answerWithOpenAI(question, place, weather, web, at);

  return NextResponse.json({
    answer: aiAnswer ?? buildFallbackAnswer(question, place, weather, web, at),
    place,
    weather,
    sources: buildSources(weather, web, Boolean(aiAnswer)),
  });
}

function normalizePlace(
  place: AskRequestBody["place"]
): GeocodeResult | null {
  if (!place) return null;
  const lat = Number(place.lat);
  const lon = Number(place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    id: 0,
    name: String(place.name || "Selected place"),
    country: String(place.country || ""),
    admin1: String(place.admin1 || ""),
    lat,
    lon,
  };
}

async function inferPlace(question: string): Promise<GeocodeResult | null> {
  const candidates = locationCandidates(question);
  for (const candidate of candidates.slice(0, 10)) {
    const match = await geocode(candidate);
    if (match) return match;
  }
  return null;
}

function locationCandidates(question: string): string[] {
  const candidates: string[] = [];
  const add = (value: string) => {
    const cleaned = value
      .replace(/[?!.,;:()[\]{}]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length >= 2 && !candidates.some((c) => c.toLowerCase() === cleaned.toLowerCase())) {
      candidates.push(cleaned);
    }
  };

  const phrasePatterns = [
    /\b(?:in|near|around|over|for|at)\s+([a-zA-ZÀ-ÿ .'’-]{2,60}?)(?=\s+(?:today|tomorrow|this|next|now|weather|forecast|rain|raining|snow|storm|wind|temperature)\b|[?!.,;:]|$)/gi,
    /\bwhy\s+(?:does\s+)?([a-zA-ZÀ-ÿ .'’-]{2,45}?)\s+(?:has|have|gets|get|is|are|rains|rain|snows|snow)\b/gi,
  ];

  for (const pattern of phrasePatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(question))) add(match[1]);
  }

  const capitalized = question.match(/\b[A-Z][a-zÀ-ÿ]+(?:[\s-][A-Z][a-zÀ-ÿ]+){0,3}\b/g) || [];
  for (const phrase of capitalized) {
    if (!STOPWORDS.has(phrase.toLowerCase())) add(phrase);
  }

  const words = question
    .toLowerCase()
    .replace(/[^a-zÀ-ÿ\s'-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));

  for (let size = Math.min(3, words.length); size >= 1; size--) {
    for (let i = 0; i <= words.length - size; i++) add(words.slice(i, i + size).join(" "));
  }

  return candidates;
}

async function geocode(query: string): Promise<GeocodeResult | null> {
  try {
    const url =
      "https://geocoding-api.open-meteo.com/v1/search?" +
      new URLSearchParams({
        name: query,
        count: "1",
        language: "en",
        format: "json",
      }).toString();
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!response.ok) return null;
    const json = await response.json();
    const first = json.results?.[0];
    if (!first) return null;
    return {
      id: Number(first.id),
      name: String(first.name ?? query),
      country: String(first.country ?? first.country_code ?? ""),
      admin1: String(first.admin1 ?? ""),
      lat: Number(first.latitude),
      lon: Number(first.longitude),
    };
  } catch {
    return null;
  }
}

async function fetchWebContext(
  question: string,
  place: GeocodeResult | null
): Promise<WebContext[]> {
  const query = place
    ? `${question} ${place.name} climate weather explanation`
    : `${question} weather climate explanation`;
  try {
    const url =
      "https://api.duckduckgo.com/?" +
      new URLSearchParams({
        q: query,
        format: "json",
        no_html: "1",
        skip_disambig: "1",
      }).toString();
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!response.ok) return [];
    const json = await response.json();
    const contexts: WebContext[] = [];
    if (json.AbstractText) {
      contexts.push({
        title: String(json.Heading || "Web summary"),
        text: String(json.AbstractText),
        url: String(json.AbstractURL || "https://duckduckgo.com"),
      });
    }
    for (const topic of flattenTopics(json.RelatedTopics || [])) {
      if (contexts.length >= 3) break;
      if (topic.Text && topic.FirstURL) {
        contexts.push({
          title: String(topic.Text).split(" - ")[0].slice(0, 80),
          text: String(topic.Text).slice(0, 260),
          url: String(topic.FirstURL),
        });
      }
    }
    return contexts;
  } catch {
    return [];
  }
}

function flattenTopics(items: any[]): any[] {
  return items.flatMap((item) => (Array.isArray(item.Topics) ? flattenTopics(item.Topics) : [item]));
}

async function answerWithOpenAI(
  question: string,
  place: GeocodeResult | null,
  weather: Awaited<ReturnType<typeof fetchOpenMeteo>>,
  web: WebContext[],
  at: Date
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const facts = [
    place ? `Place: ${place.name}, ${place.admin1 || place.country}` : "Place: not identified",
    `Question time: ${at.toISOString()}`,
    weather
      ? `Live weather: ${Math.round(weather.temp_c)}C, feels ${Math.round(weather.feels_like_c)}C, humidity ${Math.round(weather.humidity)}%, wind ${Math.round(weather.wind_kph)} km/h, cloud ${Math.round(weather.cloud_pct)}%, precipitation ${weather.precip_mm.toFixed(1)} mm, pressure ${Math.round(weather.pressure_hpa)} hPa.`
      : "Live weather: unavailable.",
    web.length
      ? `Web context: ${web.map((item) => `${item.title}: ${item.text}`).join("\n")}`
      : "Web context: unavailable.",
  ].join("\n");

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        max_tokens: 420,
        messages: [
          {
            role: "system",
            content:
              "Answer weather and climate questions for a globe dashboard. Use the supplied live weather and web context. Be concise, practical, and mention uncertainty when the context is thin.",
          },
          { role: "user", content: `${facts}\n\nQuestion: ${question}` },
        ],
      }),
    });
    if (!response.ok) return null;
    const json = await response.json();
    return String(json.choices?.[0]?.message?.content || "").trim() || null;
  } catch {
    return null;
  }
}

function buildFallbackAnswer(
  question: string,
  place: GeocodeResult | null,
  weather: Awaited<ReturnType<typeof fetchOpenMeteo>>,
  web: WebContext[],
  at: Date
): string {
  const lower = question.toLowerCase();
  const placeLabel = place
    ? [place.name, place.admin1, place.country].filter(Boolean).join(", ")
    : "that area";

  const live = weather
    ? `For ${placeLabel} around ${at.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}, Open-Meteo shows ${Math.round(weather.temp_c)}C, ${Math.round(weather.humidity)}% humidity, ${Math.round(weather.wind_kph)} km/h wind, ${Math.round(weather.cloud_pct)}% cloud cover, and ${weather.precip_mm.toFixed(1)} mm recent precipitation.`
    : place
    ? `I found ${placeLabel}, but live weather was not available from Open-Meteo for this instant.`
    : "I could not confidently identify a city in that question, so this is a general weather explanation.";

  if (lower.includes("rain") || lower.includes("wet") || lower.includes("precip")) {
    const localHint = place?.name.toLowerCase().includes("seattle")
      ? "Seattle is especially wet because Pacific air carries moisture inland, nearby mountains force that air upward, and the cool-season storm track repeatedly delivers frontal rain. The city also sits in a marine climate where clouds and drizzle are common even when totals are not extreme every day."
      : "Places get persistent rain when moist air is repeatedly lifted by fronts, hills or mountains, sea breezes, or monsoon-style circulation. Ocean exposure usually supplies the moisture; terrain and storm tracks decide where it falls.";
    return `${live}\n\n${localHint}${web[0]?.text ? `\n\nRelated context: ${web[0].text}` : ""}`;
  }

  if (lower.includes("hot") || lower.includes("heat") || lower.includes("temperature")) {
    return `${live}\n\nTemperature is mainly shaped by latitude, elevation, cloud cover, local wind direction, nearby water, and the season. Clear skies and dry air usually let daytime temperatures climb faster; clouds, rain, sea breezes, and higher elevation usually hold them down.`;
  }

  if (lower.includes("wind")) {
    return `${live}\n\nWind strengthens when pressure changes quickly over distance. Coastlines, mountain gaps, thunderstorms, and passing fronts can all focus or accelerate the flow, so local geography often matters as much as the regional forecast.`;
  }

  return `${live}\n\nThe most likely drivers are the local climate pattern, current pressure systems, nearby ocean or terrain effects, and the time of year.${web[0]?.text ? ` Web context adds: ${web[0].text}` : ""}`;
}

function buildSources(
  weather: Awaited<ReturnType<typeof fetchOpenMeteo>>,
  web: WebContext[],
  usedAi: boolean
) {
  return [
    ...(weather ? [{ label: "Open-Meteo live weather", url: "https://open-meteo.com/" }] : []),
    ...web.map((item) => ({ label: item.title, url: item.url })),
    ...(usedAi ? [{ label: "OpenAI-compatible response model", url: "" }] : []),
  ];
}