import { fairness, type Job } from "./jobs-store";
import { translateText, type Language } from "./i18n";

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

export function getOpenRouterApiKey(): string {
  if (typeof process !== "undefined" && process.env?.OPENROUTER_API_KEY) {
    return process.env.OPENROUTER_API_KEY;
  }
  if (import.meta.env?.VITE_OPENROUTER_API_KEY) return import.meta.env.VITE_OPENROUTER_API_KEY;
  return "";
}

export const DEFAULT_OPENROUTER_MODEL =
  import.meta.env.VITE_OPENROUTER_MODEL || "openai/gpt-4o-mini";

export async function askOpenRouter(
  apiKey: string,
  model: string,
  prompt: string,
  systemPrompt = GIGSHIELD_AI_SYSTEM_PROMPT,
) {
  return askOpenRouterChat(apiKey, model, [{ role: "user", text: prompt }], systemPrompt);
}

export async function askOpenRouterChat(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  systemPrompt = GIGSHIELD_CHAT_SYSTEM_PROMPT,
) {
  const activeKey = apiKey.trim() || getOpenRouterApiKey();
  if (!activeKey) throw new Error("OpenRouter API key is missing");
  const activeModel = model.trim() || DEFAULT_OPENROUTER_MODEL;
  const response = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${activeKey}`,
    },
    body: JSON.stringify({
      model: activeModel,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((message) => ({ role: message.role, content: message.text })),
      ],
      temperature: 0.3,
      max_tokens: 700,
    }),
  });
  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? "OpenRouter is rate-limited (429). Wait a minute and try again."
        : `OpenRouter request failed (${response.status})`,
    );
  }
  const data = await response.json();
  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error("OpenRouter returned an empty answer");
  return answer as string;
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
  openRouterApiKey: string,
  geminiApiKey: string,
  geminiModel: string,
  prompt: string,
  localFallback: string,
  systemPrompt = GIGSHIELD_AI_SYSTEM_PROMPT,
) {
  let openRouterError = "";
  try {
    return {
      answer: await askOpenRouter(openRouterApiKey, DEFAULT_OPENROUTER_MODEL, prompt, systemPrompt),
      source: "openrouter" as const,
    };
  } catch (error) {
    openRouterError = errorMessage(error);
  }
  let geminiError = "";
  try {
    return {
      answer: await askGemini(geminiApiKey, geminiModel, prompt, systemPrompt),
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
      error: `OpenRouter: ${openRouterError}; Gemini: ${geminiError}; LM Studio: ${errorMessage(error)}`,
    };
  }
}

export async function askWithFallback(
  openRouterApiKey: string,
  geminiApiKey: string,
  geminiModel: string,
  prompt: string,
  localFallback: string,
  systemPrompt = GIGSHIELD_AI_SYSTEM_PROMPT,
) {
  return (
    await askWithFallbackDetailed(
      openRouterApiKey,
      geminiApiKey,
      geminiModel,
      prompt,
      localFallback,
      systemPrompt,
    )
  ).answer;
}

export async function askWithFallbackChat(
  openRouterApiKey: string,
  geminiApiKey: string,
  geminiModel: string,
  messages: ChatMessage[],
  localFallback: string,
  systemPrompt = GIGSHIELD_CHAT_SYSTEM_PROMPT,
) {
  let openRouterError = "";
  try {
    return await askOpenRouterChat(
      openRouterApiKey,
      DEFAULT_OPENROUTER_MODEL,
      messages,
      systemPrompt,
    );
  } catch (error) {
    openRouterError = errorMessage(error);
  }
  let geminiError = "";
  try {
    return await askGeminiChat(geminiApiKey, geminiModel, messages, systemPrompt);
  } catch (error) {
    geminiError = errorMessage(error);
  }
  try {
    return await askLmStudioChat(messages, systemPrompt);
  } catch (error) {
    const reason =
      geminiError.includes("429") || openRouterError.includes("429")
        ? "AI is busy right now — wait a minute and try again"
        : `AI is unavailable (${openRouterError})`;
    return `${localFallback}\n\n(${reason})`;
  }
}

export function localAssistant(question: string, jobs: Job[], language: Language = "en") {
  const t = (key: string) => translateText(language, key);
  const fill = (template: string) =>
    template
      .replaceAll("{earned}", earnings.toFixed(0))
      .replaceAll("{jobs}", String(jobs.length))
      .replaceAll("{hours}", hours.toFixed(1))
      .replaceAll("{flagged}", String(flagged));
  const q = question.toLowerCase();
  const earnings = jobs.reduce((sum, job) => sum + job.fare, 0);
  const hours = jobs.reduce((sum, job) => sum + job.minutes, 0) / 60;
  const flagged = jobs.filter((job) => fairness(job, jobs).flagged).length;
  const greetings = ["hello", "hi ", "hey", "namaste", "good morning", "good evening"];
  if (greetings.some((g) => q.includes(g)))
    return t(
      "Hello! I'm GigShield. Ask me anything about your gig work — fares, earnings, safety, complaints — or any other question, and I'll do my best to help.",
    );
  if (q.includes("earn") || q.includes("hour"))
    return fill(t("You have earned ₹{earned} across {jobs} jobs and worked {hours} hours."));
  if (q.includes("fair") || q.includes("underpay"))
    return fill(
      t(
        "{flagged} job(s) may need a payout review. GigShield compares payout with a transparent distance-and-time estimate; it is not legal proof.",
      ),
    );
  if (q.includes("complaint") || q.includes("right"))
    return t(
      "Keep screenshots, trip IDs, timestamps, and payout records. Ask the platform for a written payout review.",
    );
  if (q.includes("tax"))
    return t(
      "In India, gig earnings are taxable income. Track every payout, maintain expense records (fuel, maintenance, mobile data), and consult a chartered accountant for the right deductions. This is general guidance, not legal advice.",
    );
  if (q.includes("save") || q.includes("saving"))
    return fill(
      t(
        "Across {jobs} jobs you have earned ₹{earned}. Try setting aside 10–20% of every fare and set a daily savings target on your dashboard.",
      ),
    );
  if (q.includes("safe") || q.includes("danger"))
    return t(
      "For safety: share your live location with a trusted contact, avoid remote pickups at night, and use the Safety check button on the dashboard to prepare an alert.",
    );
  if (q.includes("night"))
    return t(
      "Night shifts usually pay better but have higher risk. Review each night job's per-km rate on your dashboard to see whether the extra pay was fair.",
    );
  if (q.includes("fuel") || q.includes("petrol") || q.includes("diesel") || q.includes("expense"))
    return t(
      "Track fuel and maintenance separately from earnings. A common rule is to subtract fuel and vehicle costs from gross earnings before treating the rest as income.",
    );
  if (q.includes("break") || q.includes("tired"))
    return t("You deserve a break. Drink water, rest, and avoid riding when exhausted.");
  return fill(
    t(
      "I'm currently working offline, so I can best answer questions about your gig data — earnings (₹{earned} across {jobs} jobs), fare fairness, complaints, safety, and savings. When the AI service is available I can answer any question. Try asking: Was my fare fair?",
    ),
  );
}

export function jobsContext(jobs: Job[]) {
  return JSON.stringify(
    jobs.map((job) => ({ ...job, date: new Date(job.datetime).toLocaleString("en-IN") })),
  );
}
