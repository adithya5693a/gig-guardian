import type { Platform } from "./jobs-store";

export type OcrValues = {
  fare?: number;
  distance?: number;
  minutes?: number;
  platform?: Platform;
  datetime?: string;
  area?: string;
};

const knownPlatforms: Platform[] = ["Zomato", "Swiggy", "Uber", "Ola"];

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

export function parseOcrText(input: string): OcrValues {
  // OCR may turn the rupee symbol into R, Rs, or leave a space before the number.
  const text = input
    .replace(/[₹﹩＄]/g, "₹")
    .replace(/\s+/g, " ")
    .trim();
  const label = "(?:fare|earning(?:s)?|payout|amount|total|net|income|received|you earned)";

  const fare = firstNumber(text, [
    new RegExp(
      `${label}\\s*(?:is|:|-|=)?\\s*(?:₹|rs\\.?|inr)?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)`,
      "i",
    ),
    /(?:₹|rs\.?|inr)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
  ]);

  // Some screenshots omit all labels. Choose the largest currency-like number,
  // while excluding numbers that clearly belong to km/minutes/date fields.
  let fallbackFare = fare;
  if (!fallbackFare) {
    const currencyCandidates = [
      ...text.matchAll(/(?:₹|rs\.?|inr)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi),
    ]
      .map((match) => numberValue(match[1]))
      .filter((value): value is number => value !== undefined && value <= 100000);
    if (currencyCandidates.length) fallbackFare = Math.max(...currencyCandidates);
  }

  const distance = firstNumber(text, [
    /(?:distance|travelled|traveled|trip)\s*[:=-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:km|kilometer)?/i,
    /([0-9]+(?:\.[0-9]+)?)\s*(?:km|kilometer|kms)\b/i,
  ]);
  const minutes = firstNumber(text, [
    /(?:duration|time|taken)\s*[:=-]?\s*([0-9]+)\s*(?:min|mins|minute|minutes)\b/i,
    /([0-9]+)\s*(?:min|mins|minute|minutes)\b/i,
  ]);
  const durationClock = text.match(/(?:duration|time|taken)\s*[:=-]?\s*(\d{1,2}):(\d{2})/i);
  const parsedMinutes =
    minutes ??
    (durationClock ? Number(durationClock[1]) * 60 + Number(durationClock[2]) : undefined);
  const platform = knownPlatforms.find((item) => new RegExp(`\\b${item}\\b`, "i").test(text));
  const area = text
    .match(/(?:area|zone|location|pickup|drop(?:off)?)\s*[:=-]?\s*([A-Za-z][A-Za-z ]{2,30})/i)?.[1]
    ?.trim();

  return {
    fare: fallbackFare,
    distance,
    minutes: parsedMinutes,
    platform,
    datetime: parseDateTime(text),
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
