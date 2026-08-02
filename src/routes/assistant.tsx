import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  askWithFallbackChat,
  GIGSHIELD_CHAT_SYSTEM_PROMPT,
  jobsContext,
  localAssistant,
  type ChatMessage,
} from "@/lib/ai";
import { useJobs } from "@/lib/jobs-store";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/assistant")({
  component: Assistant,
  head: () => ({ meta: [{ title: "AI Chat — GigShield" }] }),
});

type Message = { role: "user" | "assistant"; text: string };

function Assistant() {
  const {
    jobs,
    geminiApiKey,
    setGeminiApiKey,
    geminiModel,
    openRouterApiKey,
    setOpenRouterApiKey,
  } = useJobs();
  const { language, t, translate } = useI18n();
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draftKey, setDraftKey] = useState(openRouterApiKey);
  const [draftGeminiKey, setDraftGeminiKey] = useState(geminiApiKey);
  const [showKeySettings, setShowKeySettings] = useState(false);
  const aiConnected = Boolean(openRouterApiKey || geminiApiKey);

  async function send(value = question) {
    const text = value.trim();
    if (!text || busy) return;

    setQuestion("");
    setError("");
    setMessages((current) => [...current, { role: "user", text }]);
    setBusy(true);

    try {
      const systemPrompt = `${GIGSHIELD_CHAT_SYSTEM_PROMPT}\nReply in the user's selected language (${language}). Worker job data: ${jobsContext(jobs)}.`;
      const history: ChatMessage[] = [
        ...messages.map((message) => ({ role: message.role, text: message.text })),
        { role: "user", text },
      ];
      const answer = await askWithFallbackChat(
        openRouterApiKey,
        geminiApiKey,
        geminiModel,
        history,
        localAssistant(text, jobs),
        systemPrompt,
      );
      setMessages((current) => [...current, { role: "assistant", text: answer }]);
      setError("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t("chatTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("chatSubtitle")}</p>
        </div>
        <button
          onClick={() => {
            setMessages([]);
            setError("");
          }}
          className="rounded-xl border border-border px-3 py-2 text-sm font-bold hover:bg-secondary"
        >
          {t("clear")}
        </button>
      </div>

      {aiConnected ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <p className="flex items-center gap-1.5 text-xs font-bold text-success">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-success/15 text-[10px]">
              ✓
            </span>
            {translate("AI connected")}
          </p>
          <button
            onClick={() => {
              setDraftKey(openRouterApiKey);
              setDraftGeminiKey(geminiApiKey);
              setShowKeySettings((value) => !value);
            }}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-bold hover:bg-secondary"
          >
            {translate("Change API key")}
          </button>
        </div>
      ) : null}

      {!aiConnected || showKeySettings ? (
        <div className="mt-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm font-bold">{translate("Connect AI")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {translate("Add your OpenRouter API key to enable AI answers.")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="password"
              value={draftKey}
              onChange={(event) => setDraftKey(event.target.value)}
              placeholder="sk-or-…"
              className="min-w-0 flex-1 rounded-xl border border-input bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30"
            />
            <button
              onClick={() => {
                if (draftKey.trim()) {
                  setOpenRouterApiKey(draftKey.trim());
                  setDraftKey("");
                  setShowKeySettings(false);
                }
              }}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              {translate("Save key")}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            <a
              href="https://openrouter.ai/settings/keys"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              {translate("Get a free API key at OpenRouter")}
            </a>
          </p>
          <p className="mt-3 text-xs font-bold">
            {translate("Gemini API key (optional fallback)")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {translate("Add your Gemini API key to enable AI answers.")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="password"
              value={draftGeminiKey}
              onChange={(event) => setDraftGeminiKey(event.target.value)}
              placeholder="AIza…"
              className="min-w-0 flex-1 rounded-xl border border-input bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30"
            />
            <button
              onClick={() => {
                if (draftGeminiKey.trim()) {
                  setGeminiApiKey(draftGeminiKey.trim());
                  setDraftGeminiKey("");
                  setShowKeySettings(false);
                }
              }}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              {translate("Save key")}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              {translate("Get a free API key at Google AI Studio")}
            </a>
          </p>
        </div>
      ) : null}

      <div className="mt-5 min-h-80 space-y-3 rounded-3xl border border-border bg-card p-4">
        {messages.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center text-center">
            <div className="text-4xl">🤖</div>
            <p className="mt-3 font-bold">{t("howCanIHelp")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("tryAsking")}</p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                message.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-secondary"
              }`}
            >
              {message.text}
            </div>
          ))
        )}
        {busy ? <p className="text-sm text-muted-foreground">{t("thinking")}</p> : null}
      </div>

      {error ? (
        <p className="mt-2 text-sm text-destructive">
          {error} {t("fallback")}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {[t("fareFair"), t("earned"), t("complain")].map((suggestion) => (
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
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={t("typeQuestion")}
          className="min-w-0 flex-1 rounded-xl border border-input bg-secondary px-4 py-3 outline-none focus:ring-2 focus:ring-ring/30"
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground disabled:opacity-50"
        >
          {t("send")}
        </button>
      </form>
    </AppShell>
  );
}
