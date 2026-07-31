import { fairness, type Job } from "./jobs-store";

export const GIGSHIELD_AI_SYSTEM_PROMPT =
  "You are GigShield, a helpful assistant for Indian gig workers. Always respond using Indian Rupees (₹) and kilometers (km). Never use dollars ($) or miles under any circumstance. Use simple, practical language and never present an estimate as legal proof.";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export function getGeminiApiKey(): string {
  if (typeof process !== "undefined" && process.env?.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  if (import.meta.env?.VITE_GEMINI_API_KEY) return import.meta.env.VITE_GEMINI_API_KEY;
  return "";
}

export async function askGemini(
  apiKey: string,
  model: string,
  prompt: string,
  systemPrompt = GIGSHIELD_AI_SYSTEM_PROMPT,
) {
  const activeKey = apiKey.trim() || getGeminiApiKey();
  if (!activeKey || activeKey === "your_gemini_api_key_here") {
    throw new Error("Gemini API key is missing");
  }
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(activeKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    },
  );
  if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
  const data = await response.json();
  const answer =
    data.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? "")
      .join("")
      .trim() ?? "";
  if (!answer) throw new Error("Gemini returned an empty answer");
  return answer;
}

export async function askLmStudio(prompt: string, systemPrompt = GIGSHIELD_AI_SYSTEM_PROMPT) {
  const endpoint =
    import.meta.env.VITE_LM_STUDIO_URL || "http://127.0.0.1:1234/v1/chat/completions";
  const model = import.meta.env.VITE_LM_STUDIO_MODEL || "Qwen2.5-Coder-7B-Instruct-4bit";
  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 300,
    }),
  });
  if (!response.ok) throw new Error(`LM Studio request failed (${response.status})`);
  const data = await response.json();
  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error("LM Studio returned no answer");
  return answer as string;
}

export async function askWithFallbackDetailed(
  apiKey: string,
  geminiModel: string,
  prompt: string,
  localFallback: string,
  systemPrompt = GIGSHIELD_AI_SYSTEM_PROMPT,
) {
  let geminiError = "";
  try {
    return {
      answer: await askGemini(apiKey, geminiModel, prompt, systemPrompt),
      source: "gemini" as const,
    };
  } catch (error) {
    geminiError = errorMessage(error);
  }
  try {
    return {
      answer: await askLmStudio(prompt, systemPrompt),
      source: "lm-studio" as const,
    };
  } catch (error) {
    return {
      answer: localFallback,
      source: "local" as const,
      error: `Gemini: ${geminiError}; LM Studio: ${errorMessage(error)}`,
    };
  }
}

export async function askWithFallback(
  apiKey: string,
  geminiModel: string,
  prompt: string,
  localFallback: string,
  systemPrompt = GIGSHIELD_AI_SYSTEM_PROMPT,
) {
  return (await askWithFallbackDetailed(apiKey, geminiModel, prompt, localFallback, systemPrompt))
    .answer;
}

export function localAssistant(question: string, jobs: Job[]) {
  const q = question.toLowerCase();
  const earnings = jobs.reduce((sum, job) => sum + job.fare, 0);
  const hours = jobs.reduce((sum, job) => sum + job.minutes, 0) / 60;
  const flagged = jobs.filter((job) => fairness(job).flagged).length;
  if (q.includes("earn") || q.includes("hour"))
    return `You have earned ₹${earnings.toFixed(0)} across ${jobs.length} jobs and worked ${hours.toFixed(1)} hours.`;
  if (q.includes("fair") || q.includes("underpay"))
    return `${flagged} job(s) may need a payout review. GigShield compares payout with a transparent distance-and-time estimate; it is not legal proof.`;
  if (q.includes("complaint") || q.includes("right"))
    return "Keep screenshots, trip IDs, timestamps, and payout records. Ask the platform for a written payout review.";
  if (q.includes("break") || q.includes("tired"))
    return "You deserve a break. Drink water, rest, and avoid riding when exhausted.";
  return "I can help with fare fairness, earnings, complaints, working hours, safety, and savings. Try asking: Was my fare fair?";
}

export function jobsContext(jobs: Job[]) {
  return JSON.stringify(
    jobs.map((job) => ({ ...job, date: new Date(job.datetime).toLocaleString("en-IN") })),
  );
}
