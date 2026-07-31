import { fairness, type Job } from "./jobs-store";

export function getGeminiApiKey(): string {
  // Check process.env.GEMINI_API_KEY first (populated by vite define or node server)
  if (typeof process !== "undefined" && process.env && process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  // Fallback to VITE_ prefix standard
  if (import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) {
    return import.meta.env.VITE_GEMINI_API_KEY;
  }
  return "";
}

export async function askGemini(apiKey: string, model: string, prompt: string) {
  const activeKey = apiKey.trim() || getGeminiApiKey();
  if (!activeKey) {
    throw new Error("AI insight unavailable right now");
  }
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(activeKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
    },
  );
  if (!response.ok) throw new Error("AI insight unavailable right now");
  const data = await response.json();
  const answer = data.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? "")
    .join("") ?? null;
  
  if (!answer) {
    throw new Error("AI insight unavailable right now");
  }
  return answer;
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
