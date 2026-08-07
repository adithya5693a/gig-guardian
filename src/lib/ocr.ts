import type { Platform, VehicleType } from "./jobs-store";

export type OcrValues = {
  fare?: number;
  paymentMode?: string;
  pickupDistance?: number;
  distance?: number; // trip distance
  minutes?: number;
  platform?: Platform;
  vehicleType?: VehicleType;
  datetime?: string;
  pickupArea?: string;
  dropArea?: string;
  area?: string;
};

const knownPlatforms: Platform[] = ["Zomato", "Swiggy", "Uber", "Ola", "Rapido"];

function numberValue(value: string) {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function firstNumber(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1] ? numberValue(match[1]) : undefined;
    if (value !== undefined) return value;
  }
  return undefined;
}

type TimeDistancePair = { lineIndex: number; minutes: number; distance: number };

function cleanOcrLines(input: string) {
  return input
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/\s+/g, " ")
        .replace(/^[ .,\x2f]+|[ .,\x2f]+$/g, "")
        .trim(),
    )
    .filter(Boolean);
}

function extractTimeDistancePairs(lines: string[]): TimeDistancePair[] {
  const pattern = /(\d+)\s*(?:min|mins|minute|minutes).*?\(?\s*(\d+(?:\.\d+)?)\s*km\s*\)?/i;
  return lines.flatMap((line, lineIndex) => {
    const match = line.match(pattern);
    if (!match) return [];
    return [{ lineIndex, minutes: Number(match[1]), distance: Number(match[2]) }];
  });
}

function extractAddress(lines: string[], start: number, end = lines.length) {
  const address: string[] = [];
  for (const line of lines.slice(start, end)) {
    if (line.length <= 2) continue;
    if (/\d+\s*(?:min|mins|minute|minutes).*?\d+(?:\.\d+)?\s*km/i.test(line)) break;
    address.push(line);
    if (/\b\d{6}\b/.test(line)) break;
  }
  return address.join(", ");
}

function extractArea(address: string) {
  if (!address) return undefined;
  const cities = new Set([
    "hyderabad",
    "bengaluru",
    "bangalore",
    "mumbai",
    "delhi",
    "new delhi",
    "chennai",
    "kolkata",
    "pune",
  ]);
  const parts = address
    .split(",")
    .map((part) => part.replace(/\b\d{6}\b/g, "").trim())
    .filter(Boolean);
  return [...parts].reverse().find((part) => !cities.has(part.toLowerCase())) ?? parts.at(-1);
}

function parseDateTime(text: string) {
  const dateMatch = text.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b/);
  if (!dateMatch) return undefined;
  const parts = dateMatch[1].split(/[/-]/).map(Number);
  const year = parts[0] > 31 ? parts[0] : parts[2] < 100 ? 2000 + parts[2] : parts[2];
  const month = parts[0] > 31 ? parts[1] : parts[1];
  const day = parts[0] > 31 ? parts[2] : parts[0];
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) return undefined;

  const timeMatch = text.match(/\b(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/i);
  let hours = 10;
  let minutes = 0;
  if (timeMatch) {
    hours = Number(timeMatch[1]);
    minutes = Number(timeMatch[2]);
    if (timeMatch[3]?.toLowerCase() === "pm" && hours < 12) hours += 12;
    if (timeMatch[3]?.toLowerCase() === "am" && hours === 12) hours = 0;
  }
  parsed.setHours(hours, minutes, 0, 0);
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function parseVehicleType(text: string): VehicleType | undefined {
  if (/\bcar\s*\(?ac\b|\bpremium\b/i.test(text)) return "Car (AC/Premium)";
  if (/\bcar\s*\(?non-?ac\b/i.test(text)) return "Car (Non-AC)";
  if (/\bauto\b/i.test(text)) return "Auto";
  if (/\bbike\b|\bmoto\b|\brider?\b/i.test(text)) return "Bike";
  if (/\bcar\b|\bcab\b|\bsedan\b|\bhatchback\b/i.test(text)) return "Car (Non-AC)";
  return undefined;
}

export function parseOcrText(input: string): OcrValues {
  const rawLines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const structuredLines = cleanOcrLines(input);
  const timeDistancePairs = extractTimeDistancePairs(structuredLines);
  // Clean up and normalize whitespace and currency symbols
  const text = input
    .replace(/[₹﹩＄]/g, "₹")
    .replace(/\b(?:rs\.?|inr|रु\.?)\s*/gi, "₹")
    .replace(/\s+/g, " ")
    .trim();

  // Payout & Payment Mode detection (e.g. "₹29 (Cash)" or "₹29 Cash")
  const fareWithModeMatch = text.match(
    /(?:fare|earning(?:s)?|payout|amount|total|cash)?\s*[:=-]?\s*₹\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)(?:\s*(?:\(([^)]+)\)|([A-Za-z]+)))?/i,
  );
  let fare: number | undefined = fareWithModeMatch?.[1]
    ? numberValue(fareWithModeMatch[1])
    : undefined;
  let paymentMode: string | undefined =
    fareWithModeMatch?.[2]?.trim() || fareWithModeMatch?.[3]?.trim();

  if (paymentMode && !/cash|online|wallet|upi|paytm|card|collect/i.test(paymentMode)) {
    paymentMode = undefined;
  }

  // Fallback fare match if explicit label wasn't found
  if (!fare) {
    const currencyCandidates = [...text.matchAll(/₹\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi)]
      .map((match) => numberValue(match[1]))
      .filter((value): value is number => value !== undefined && value <= 100000);
    if (currencyCandidates.length) fare = Math.max(...currencyCandidates);
  }

  // Some delivery screenshots omit the rupee symbol after OCR. Prefer a number
  // near an earning/payout label before considering any other standalone number.
  if (!fare) {
    const labelledFare = text.match(
      /(?:fare|earning(?:s)?|payout|amount|total|cash)\s*[:=-]?\s*(?:rs\.?|inr)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    );
    fare = labelledFare?.[1] ? numberValue(labelledFare[1]) : undefined;
  }

  // Extract payment mode if not captured above
  if (!paymentMode) {
    const modeMatch = text.match(/\((cash|online|wallet|upi|paytm|card)\)/i);
    if (modeMatch) paymentMode = modeMatch[1];
  }

  // Multi-distance parsing: find all [number] km occurrences
  const distanceMatches = [
    ...text.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*(?:km|kms|kilometer|kilometers)\b/gi),
  ];
  const foundDistances = distanceMatches
    .map((m) => numberValue(m[1]))
    .filter((val): val is number => val !== undefined);

  let pickupDistance: number | undefined;
  let tripDistance: number | undefined;

  if (foundDistances.length >= 2) {
    pickupDistance = foundDistances[0];
    tripDistance = foundDistances[1];
  } else if (foundDistances.length === 1) {
    tripDistance = foundDistances[0];
  }

  // Fallback single distance check
  if (!tripDistance) {
    tripDistance = firstNumber(text, [
      /(?:distance|travelled|traveled|trip)\s*[:=-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:km|kilometer)?/i,
    ]);
  }

  // Duration/time parsing: ONLY parse if explicit time keywords are present
  let minutes: number | undefined;
  const timeKeywordMatch = text.match(
    /(?:duration|time|taken|est\.?|trip time)\s*[:=-]?\s*([0-9]+)\s*(?:min|mins|minute|minutes)\b/i,
  );
  if (timeKeywordMatch) {
    minutes = numberValue(timeKeywordMatch[1]);
  } else {
    // Check standalone min indicator
    const minMatch = text.match(/\b([0-9]+)\s*(?:min|mins|minutes)\b/i);
    if (minMatch) minutes = numberValue(minMatch[1]);
  }
  if (!minutes) {
    const labelledTime = text.match(
      /(?:duration|time taken|trip time|eta)\s*[:=-]?\s*([0-9]{1,3})(?!\s*[:.])/i,
    );
    const value = labelledTime?.[1] ? numberValue(labelledTime[1]) : undefined;
    if (value && value <= 600) minutes = value;
  }

  // Prefer the last time-distance pair as the actual trip, matching the
  // supplied ride parser. Earlier pairs are commonly pickup legs.
  const actualPair = timeDistancePairs.at(-1);
  if (actualPair) {
    tripDistance = actualPair.distance;
    minutes = actualPair.minutes;
  }

  // Platform detection
  const platform = knownPlatforms.find((item) => new RegExp(`\\b${item}\\b`, "i").test(text));

  // Vehicle type detection
  const vehicleType = parseVehicleType(text);

  // Address parsing (pickup and drop areas)
  const pickupMatch = text.match(
    /(?:pickup|from|start|origin)\s*[:=-]?\s*([A-Za-z0-9\s,.-]{3,40})/i,
  );
  const dropMatch = text.match(
    /\b(?:drop|dropoff|to|dest|destination)\b\s*[:=-]?\s*([A-Za-z0-9\s,.-]{3,40})/i,
  );

  const pickupArea = pickupMatch?.[1]?.trim();
  const dropArea = dropMatch?.[1]?.trim();

  // General area fallback
  const areaMatch = text.match(/(?:area|zone|location)\s*[:=-]?\s*([A-Za-z0-9\s,.-]{3,30})/i);
  const area = dropArea || areaMatch?.[1]?.trim() || pickupArea;
  const previousPair = timeDistancePairs.at(-2);
  const fromAddress =
    previousPair && actualPair
      ? extractAddress(structuredLines, previousPair.lineIndex + 1, actualPair.lineIndex)
      : "";
  const toAddress = actualPair ? extractAddress(structuredLines, actualPair.lineIndex + 1) : "";
  const structuredPickupArea = extractArea(fromAddress);
  const structuredDropArea = extractArea(toAddress);
  const lineArea = rawLines
    .filter((line) => /,/.test(line) && /[A-Za-z]{3}/.test(line))
    .sort((a, b) => b.length - a.length)[0];
  const resolvedArea = structuredDropArea || structuredPickupArea || area || lineArea;

  return {
    fare,
    paymentMode,
    pickupDistance,
    distance: tripDistance,
    minutes,
    platform,
    vehicleType,
    datetime: parseDateTime(text),
    pickupArea,
    dropArea: structuredDropArea || dropArea,
    area: resolvedArea,
  };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = (reader.result as string).split(",")[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
  });
}

function safeJsonParse(text: string) {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "");
  }
  return JSON.parse(cleaned.trim());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeOcrValues(parsed: any): OcrValues {
  const result: OcrValues = {};
  if (!parsed || typeof parsed !== "object") return result;

  if (typeof parsed.fare === "number" && parsed.fare > 0) {
    result.fare = parsed.fare;
  } else if (typeof parsed.fare === "string") {
    const f = parseFloat(parsed.fare.replace(/[^0-9.]/g, ""));
    if (!isNaN(f) && f > 0) result.fare = f;
  }

  if (typeof parsed.paymentMode === "string" && parsed.paymentMode) {
    result.paymentMode = parsed.paymentMode;
  }

  if (typeof parsed.pickupDistance === "number" && parsed.pickupDistance > 0) {
    result.pickupDistance = parsed.pickupDistance;
  } else if (typeof parsed.pickupDistance === "string") {
    const pd = parseFloat(parsed.pickupDistance.replace(/[^0-9.]/g, ""));
    if (!isNaN(pd) && pd > 0) result.pickupDistance = pd;
  }

  if (typeof parsed.distance === "number" && parsed.distance > 0) {
    result.distance = parsed.distance;
  } else if (typeof parsed.distance === "string") {
    const d = parseFloat(parsed.distance.replace(/[^0-9.]/g, ""));
    if (!isNaN(d) && d > 0) result.distance = d;
  }

  if (typeof parsed.minutes === "number" && parsed.minutes > 0) {
    result.minutes = Math.round(parsed.minutes);
  } else if (typeof parsed.minutes === "string") {
    const m = parseInt(parsed.minutes.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(m) && m > 0) result.minutes = m;
  }

  if (typeof parsed.platform === "string") {
    const matched = knownPlatforms.find(
      (p) => p.toLowerCase() === parsed.platform.trim().toLowerCase(),
    );
    if (matched) result.platform = matched;
  }

  if (typeof parsed.vehicleType === "string") {
    const vt = parsed.vehicleType.trim();
    if (["Bike", "Auto", "Car (Non-AC)", "Car (AC/Premium)"].includes(vt)) {
      result.vehicleType = vt as VehicleType;
    } else {
      const parsedVt = parseVehicleType(vt);
      if (parsedVt) result.vehicleType = parsedVt;
    }
  }

  if (typeof parsed.datetime === "string" && parsed.datetime) {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(parsed.datetime)) {
      result.datetime = parsed.datetime.slice(0, 16);
    }
  }

  if (typeof parsed.area === "string" && parsed.area) {
    result.area = parsed.area.trim();
  }

  return result;
}

const OCR_AI_PROMPT = `Analyze this screenshot of a gig worker's completed ride or delivery job (from platforms like Uber, Ola, Rapido, Swiggy, Zomato, etc.). Extract the details of the job. Return ONLY a valid JSON object matching the following structure. Do not include markdown code block syntax (like \`\`\`json). Just return raw JSON. If any value is unknown, omit it or set it to null.

{
  "fare": number (the total payout/earnings in rupees. E.g. 150.50. Focus on the main payout amount, checking rupees, Rs, INR. If there are multiple numbers, find the net payout for this trip/job. Convert to number),
  "paymentMode": string (e.g. "Cash", "Online", "Wallet", "UPI"),
  "pickupDistance": number (distance to pickup in km, if any, as a number),
  "distance": number (the actual trip/delivery/travelled distance in km as a number),
  "minutes": number (the duration/time taken in minutes as an integer number),
  "platform": "Zomato" | "Swiggy" | "Uber" | "Ola" | "Rapido" | "Other" (detect the platform from logos/text),
  "vehicleType": "Bike" | "Auto" | "Car (Non-AC)" | "Car (AC/Premium)" (detect or infer from labels/icons. E.g. moto/bike -> Bike),
  "datetime": "YYYY-MM-DDTHH:MM" (current date/time or date/time from the screenshot, formatted as local ISO timestamp without seconds, e.g. 2026-08-07T13:00),
  "area": string (the location/neighborhood/zone of the pickup/dropoff)
}`;

async function extractOcrWithGemini(
  file: File,
  apiKey: string,
  model: string = "gemini-2.0-flash",
): Promise<OcrValues> {
  const base64 = await fileToBase64(file);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: OCR_AI_PROMPT },
              {
                inlineData: {
                  mimeType: file.type,
                  data: base64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Gemini API error (HTTP ${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned an empty response");

  return normalizeOcrValues(safeJsonParse(text));
}

async function extractOcrWithOpenRouter(file: File, apiKey: string): Promise<OcrValues> {
  const base64 = await fileToBase64(file);
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: OCR_AI_PROMPT,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${file.type};base64,${base64}`,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`OpenRouter API error (HTTP ${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenRouter returned an empty response");

  return normalizeOcrValues(safeJsonParse(text));
}

export async function extractOcr(
  file: File,
  apiKeys?: {
    geminiApiKey?: string;
    openRouterApiKey?: string;
    geminiModel?: string;
  },
) {
  const openRouterKey = apiKeys?.openRouterApiKey?.trim();
  const geminiKey = apiKeys?.geminiApiKey?.trim();
  const geminiModel = apiKeys?.geminiModel?.trim() || "gemini-2.0-flash";

  let lastError: Error | null = null;

  if (openRouterKey) {
    try {
      const values = await extractOcrWithOpenRouter(file, openRouterKey);
      return {
        text: `AI Extraction (OpenRouter)\n${JSON.stringify(values, null, 2)}`,
        values,
        source: "AI (OpenRouter)" as const,
      };
    } catch (e) {
      console.warn("OpenRouter OCR failed, trying fallback:", e);
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  if (geminiKey && geminiKey !== "your_gemini_api_key_here") {
    try {
      const values = await extractOcrWithGemini(file, geminiKey, geminiModel);
      return {
        text: `AI Extraction (Gemini)\n${JSON.stringify(values, null, 2)}`,
        values,
        source: "AI (Gemini)" as const,
      };
    } catch (e) {
      console.warn("Gemini OCR failed, trying fallback:", e);
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  // Fallback to local Tesseract OCR
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const result = await worker.recognize(file);
    const text = result.data.text;
    const values = parseOcrText(text);
    return {
      text,
      values,
      source: "Local (Tesseract.js)" as const,
      ...(lastError ? { error: lastError.message } : {}),
    };
  } finally {
    await worker.terminate();
  }
}
