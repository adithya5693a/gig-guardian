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
  // Clean up and normalize whitespace and currency symbols
  const text = input
    .replace(/[₹﹩＄]/g, "₹")
    .replace(/\s+/g, " ")
    .trim();

  // Payout & Payment Mode detection (e.g. "₹29 (Cash)" or "₹29 Cash")
  const fareWithModeMatch = text.match(
    /(?:fare|earning(?:s)?|payout|amount|total)?\s*[:=-]?\s*₹\s*([0-9]+(?:\.[0-9]{1,2})?)(?:\s*(?:\(([^)]+)\)|([A-Za-z]+)))?/i,
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
    const currencyCandidates = [
      ...text.matchAll(/(?:₹|rs\.?|inr)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi),
    ]
      .map((match) => numberValue(match[1]))
      .filter((value): value is number => value !== undefined && value <= 100000);
    if (currencyCandidates.length) fare = Math.max(...currencyCandidates);
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

  // Platform detection
  const platform = knownPlatforms.find((item) => new RegExp(`\\b${item}\\b`, "i").test(text));

  // Vehicle type detection
  const vehicleType = parseVehicleType(text);

  // Address parsing (pickup and drop areas)
  const pickupMatch = text.match(
    /(?:pickup|from|start|origin)\s*[:=-]?\s*([A-Za-z0-9\s,.-]{3,40})/i,
  );
  const dropMatch = text.match(/(?:drop|dropoff|to|dest|destination)\s*[:=-]?\s*([A-Za-z0-9\s,.-]{3,40})/i);

  const pickupArea = pickupMatch?.[1]?.trim();
  const dropArea = dropMatch?.[1]?.trim();

  // General area fallback
  const areaMatch = text.match(
    /(?:area|zone|location)\s*[:=-]?\s*([A-Za-z0-9\s,.-]{3,30})/i,
  );
  const area = dropArea || areaMatch?.[1]?.trim() || pickupArea;

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
    dropArea,
    area,
  };
}

export async function extractOcr(file: File) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const result = await worker.recognize(file);
    return { text: result.data.text, values: parseOcrText(result.data.text) };
  } finally {
    await worker.terminate();
  }
}
