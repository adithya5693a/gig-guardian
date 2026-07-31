import { fairness, type Job } from "./jobs-store";

export async function askGemini(apiKey: string, model: string, prompt: string) {
  if (!apiKey.trim()) return null;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
    },
  );
  if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
  const data = await response.json();
  return (
    data.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? "")
      .join("") ?? null
  );
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
