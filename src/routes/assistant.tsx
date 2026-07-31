import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { askGemini, jobsContext, localAssistant } from "@/lib/ai";
import { useJobs } from "@/lib/jobs-store";
import { extractOcr, parseOcrText, type OcrValues } from "@/lib/ocr";

export const Route = createFileRoute("/assistant")({
  component: Assistant,
  head: () => ({ meta: [{ title: "AI Companion — GigShield" }] }),
});

function Assistant() {
  const { jobs, geminiApiKey, geminiModel, setGeminiApiKey, setGeminiModel } = useJobs();
  const [messages, setMessages] = useState<{ role: "worker" | "assistant"; text: string }[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ocrText, setOcrText] = useState("");
  const [ocrValues, setOcrValues] = useState<OcrValues>({});
  const [ocrBusy, setOcrBusy] = useState(false);

  async function uploadScreenshot(file: File) {
    setOcrBusy(true);
    setError("");
    try {
      const result = await extractOcr(file);
      setOcrText(result.text);
      setOcrValues(result.values);
      const found = Object.entries(result.values)
        .filter(([, value]) => value !== undefined && value !== "")
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n");
      setMessages((prev) => [
        ...prev,
        {
          role: "worker",
          text: `📷 Screenshot uploaded\n${found || "No structured values found yet."}`,
        },
      ]);
      setQuestion("Please explain the earnings details in this screenshot.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "This screenshot could not be read.");
    } finally {
      setOcrBusy(false);
    }
  }

  function updateOcrText(text: string) {
    setOcrText(text);
    setOcrValues(parseOcrText(text));
  }

  async function send(value = question) {
    const text = value.trim();
    if (!text || busy) return;
    setQuestion("");
    setError("");
    setMessages((prev) => [...prev, { role: "worker", text }]);
    setBusy(true);
    try {
      const prompt = `You are GigShield, a kind AI companion for gig workers. Use simple language, never present an estimate as legal proof, and give practical next steps. Worker job data: ${jobsContext(jobs)}. OCR text from the worker's screenshot: ${ocrText || "none"}. Extracted screenshot values: ${JSON.stringify(ocrValues)}. Worker question: ${text}. Answer in under 150 words.`;
      const answer =
        (await askGemini(geminiApiKey, geminiModel, prompt)) ?? localAssistant(text, jobs);
      setMessages((prev) => [...prev, { role: "assistant", text: answer }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gemini could not answer right now.");
      setMessages((prev) => [...prev, { role: "assistant", text: localAssistant(text, jobs) }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">AI companion</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ask about fair fares, rights, complaints, safety, or savings.
          </p>
        </div>
        <button
          onClick={() => setMessages([])}
          className="rounded-xl border border-border px-3 py-2 text-sm font-bold hover:bg-secondary"
        >
          Clear chat
        </button>
      </div>

      <div className="mt-5 rounded-3xl border border-border bg-card p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Gemini setup
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            value={geminiApiKey}
            onChange={(e) => setGeminiApiKey(e.target.value)}
            type="password"
            placeholder="Paste Gemini API key (optional)"
            className="w-full rounded-xl border border-input bg-secondary px-3 py-2.5 outline-none focus:ring-2 focus:ring-ring/30"
          />
          <select
            value={geminiModel}
            onChange={(e) => setGeminiModel(e.target.value)}
            className="rounded-xl border border-input bg-secondary px-3 py-2.5 outline-none"
          >
            <option>gemini-2.0-flash</option>
            <option>gemini-1.5-flash</option>
            <option>gemini-1.5-pro</option>
          </select>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Without a key, GigShield uses a local demo assistant. For production, keep the key on a
          backend instead of the browser.
        </p>
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-sm font-bold">Send a delivery or ride screenshot</p>
          <p className="mt-1 text-xs text-muted-foreground">
            GigShield will OCR the screenshot and use the extracted details in the chat.
          </p>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadScreenshot(file);
            }}
            className="mt-3 block w-full text-sm"
          />
          {ocrBusy ? (
            <p className="mt-2 text-sm text-muted-foreground">Reading screenshot…</p>
          ) : null}
          {ocrText ? (
            <>
              <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Review or correct OCR text
                <textarea
                  value={ocrText}
                  onChange={(e) => updateOcrText(e.target.value)}
                  className="mt-1 min-h-24 w-full rounded-xl border border-input bg-secondary p-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring/30"
                />
              </label>
              <p className="mt-2 whitespace-pre-wrap rounded-xl bg-secondary p-3 text-xs">
                Detected:{" "}
                {Object.entries(ocrValues)
                  .filter(([, value]) => value !== undefined && value !== "")
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(" · ") || "No labelled values detected; edit the OCR text above."}
              </p>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-4 min-h-64 space-y-3 rounded-3xl border border-border bg-card p-4">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Try “Was my fare fair?” or “How do I raise a complaint?”
          </p>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${message.role === "worker" ? "ml-auto bg-primary text-primary-foreground" : "bg-secondary"}`}
            >
              {message.text}
            </div>
          ))
        )}
        {busy ? <p className="text-sm text-muted-foreground">GigShield is thinking…</p> : null}
      </div>
      {error ? <p className="mt-2 text-sm text-destructive">{error} Local fallback used.</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {[
          "Was my fare fair?",
          "How much did I earn per hour?",
          "How do I complain?",
          "Am I working too much?",
        ].map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => void send(suggestion)}
            className="rounded-full border border-border px-3 py-2 text-xs font-bold hover:bg-secondary"
          >
            {suggestion}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask GigShield something…"
          className="min-w-0 flex-1 rounded-xl border border-input bg-secondary px-4 py-3 outline-none focus:ring-2 focus:ring-ring/30"
        />
        <button
          disabled={busy}
          className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </AppShell>
  );
}
