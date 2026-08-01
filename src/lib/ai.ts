import { fairness, type Job } from "./jobs-store";

export const GIGSHIELD_AI_SYSTEM_PROMPT =
  "You are GigShield, a helpful assistant for Indian gig workers. Always respond using Indian Rupees (₹) and kilometers (km). Never use dollars ($) or miles under any circumstance. Use simple, practical language and never present an estimate as legal proof.";

export const GIGSHIELD_CHAT_SYSTEM_PROMPT =
  "You are GigShield, a friendly AI assistant for Indian gig workers. You can answer questions about fares, earnings, safety, complaints, working hours, savings, taxes and more — using the worker's job data when provided. You can also answer general questions (travel, health, money, local laws, food, technology, and anything else). If you do not know something, say so honestly instead of guessing. Always respond using Indian Rupees (₹) and kilometers (km); never use dollars ($) or miles. Use simple, practical language and never present an estimate as legal proof.";

export type ChatMessage = { role: "user" | "assistant"; text: string };

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

async function geminiFetchWithRetry(url: string, init: RequestInit) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetchWithTimeout(url, init);
    if (response.status === 429 && attempt < maxAttempts) {
      const retryAfterSeconds = Number(response.headers.get("Retry-After"));
      const delay = retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : attempt * 2000;
      await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 10_000)));
      continue;
    }
    return response;
  }
  throw new Error("Gemini request failed (429)");
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
  return askGeminiChat(apiKey, model, [{ role: "user", text: prompt }], systemPrompt);
}

export async function askGeminiChat(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  systemPrompt = GIGSHIELD_CHAT_SYSTEM_PROMPT,
) {
  const activeKey = apiKey.trim() || getGeminiApiKey();
  if (!activeKey || activeKey === "your_gemini_api_key_here") {
    throw new Error("Gemini API key is missing");
  }
  const response = await geminiFetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(activeKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: messages.map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.text }],
        })),
      }),
    },
  );
  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? "Gemini is rate-limited (429). Wait a minute and try again."
        : `Gemini request failed (${response.status})`,
    );
  }
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
      max_tokens: 600,
    }),
  });
  if (!response.ok) throw new Error(`LM Studio request failed (${response.status})`);
  const data = await response.json();
  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error("LM Studio returned no answer");
  return answer as string;
}

export async function askLmStudioChat(
  messages: ChatMessage[],
  systemPrompt = GIGSHIELD_CHAT_SYSTEM_PROMPT,
) {
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
        ...messages.map((message) => ({ role: message.role, content: message.text })),
      ],
      temperature: 0.3,
      max_tokens: 600,
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

export async function askWithFallbackChat(
  apiKey: string,
  geminiModel: string,
  messages: ChatMessage[],
  localFallback: string,
  systemPrompt = GIGSHIELD_CHAT_SYSTEM_PROMPT,
) {
  let geminiError = "";
  try {
    return await askGeminiChat(apiKey, geminiModel, messages, systemPrompt);
  } catch (error) {
    geminiError = errorMessage(error);
  }
  try {
    return await askLmStudioChat(messages, systemPrompt);
  } catch (error) {
    const reason = geminiError.includes("429")
      ? "AI is busy right now — wait a minute and try again"
      : `AI is unavailable (${geminiError})`;
    return `${localFallback}\n\n(${reason})`;
  }
}

export function localAssistant(question: string, jobs: Job[]) {
  const q = question.toLowerCase();
  const earnings = jobs.reduce((sum, job) => sum + job.fare, 0);
  const hours = jobs.reduce((sum, job) => sum + job.minutes, 0) / 60;
  const flagged = jobs.filter((job) => fairness(job).flagged).length;
  const greetings = ["hello", "hi ", "hey", "namaste", "good morning", "good evening"];
  if (greetings.some((g) => q.includes(g)))
    return "Hello! I'm GigShield. Ask me anything about your gig work — fares, earnings, safety, complaints — or any other question, and I'll do my best to help.";
  if (q.includes("earn") || q.includes("hour"))
    return `You have earned ₹${earnings.toFixed(0)} across ${jobs.length} jobs and worked ${hours.toFixed(1)} hours.`;
  if (q.includes("fair") || q.includes("underpay"))
    return `${flagged} job(s) may need a payout review. GigShield compares payout with a transparent distance-and-time estimate; it is not legal proof.`;
  if (q.includes("complaint") || q.includes("right"))
    return "Keep screenshots, trip IDs, timestamps, and payout records. Ask the platform for a written payout review.";
  if (q.includes("tax"))
    return "In India, gig earnings are taxable income. Track every payout, maintain expense records (fuel, maintenance, mobile data), and consult a chartered accountant for the right deductions. This is general guidance, not legal advice.";
  if (q.includes("save") || q.includes("saving"))
    return `Across ${jobs.length} jobs you have earned ₹${earnings.toFixed(0)}. Try setting aside 10–20% of every fare and set a daily savings target on your dashboard.`;
  if (q.includes("safe") || q.includes("danger"))
    return "For safety: share your live location with a trusted contact, avoid remote pickups at night, and use the Safety check button on the dashboard to prepare an alert.";
  if (q.includes("night"))
    return "Night shifts usually pay better but have higher risk. Review each night job's per-km rate on your dashboard to see whether the extra pay was fair.";
  if (q.includes("fuel") || q.includes("petrol") || q.includes("diesel") || q.includes("expense"))
    return "Track fuel and maintenance separately from earnings. A common rule is to subtract fuel and vehicle costs from gross earnings before treating the rest as income.";
  if (q.includes("break") || q.includes("tired"))
    return "You deserve a break. Drink water, rest, and avoid riding when exhausted.";
  return `I'm currently working offline, so I can best answer questions about your gig data — earnings (₹${earnings.toFixed(0)} across ${jobs.length} jobs), fare fairness, complaints, safety, and savings. When the AI service is available I can answer any question. Try asking: Was my fare fair?`;
}

export function jobsContext(jobs: Job[]) {
  return JSON.stringify(
    jobs.map((job) => ({ ...job, date: new Date(job.datetime).toLocaleString("en-IN") })),
  );
}
