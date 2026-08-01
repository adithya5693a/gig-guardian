import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Clock,
  IndianRupee,
  MessageCircle,
  Percent,
  PiggyBank,
  ShieldAlert,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EarningsChart } from "@/components/EarningsChart";
import { FairnessRing } from "@/components/FairnessRing";
import { StatCard } from "@/components/StatCard";
import {
  askWithFallback,
  askWithFallbackDetailed,
  GIGSHIELD_AI_SYSTEM_PROMPT,
  jobsContext,
} from "@/lib/ai";
import {
  benchmarkForVehicle,
  fairness,
  jobsThisWeek,
  jobsLastWeek,
  startOfWeek,
  useJobs,
  type Job,
} from "@/lib/jobs-store";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "GigShield — Fair Pay, Safety and Worker Support" }] }),
  component: Dashboard,
});

function Setup() {
  const { completeSetup } = useJobs();
  const { translate } = useI18n();
  const [count, setCount] = useState(1);
  return (
    <AppShell>
      <div className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-6 sm:p-8">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-xl font-black text-primary-foreground">
          G
        </div>
        <h1 className="mt-5 text-3xl font-extrabold tracking-tight">
          {translate("Let’s record your work")}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {translate("How many jobs are you working or recording today? You can add more later.")}
        </p>
        <label className="mt-6 block text-sm font-bold">
          {translate("Number of jobs")}
          <input
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
            type="number"
            min="1"
            max="100"
            className="mt-2 w-full rounded-xl border border-input bg-secondary px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-ring/30"
          />
        </label>
        <p className="mt-3 text-xs text-muted-foreground">
          {translate(
            "For every job you can enter fare, distance and time manually, or scan an app screenshot with OCR.",
          )}
        </p>
        <button
          onClick={() => completeSetup(count)}
          className="mt-6 w-full rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground"
        >
          {translate("Start logging jobs")}
        </button>
      </div>
    </AppShell>
  );
}

function ThisWeeksInsight() {
  const { jobs: allJobs, geminiApiKey, geminiModel } = useJobs();
  const { translate, language } = useI18n();
  const [insight, setInsight] = useState("");
  const [busy, setBusy] = useState(false);

  const thisWeekJobs = useMemo(() => jobsThisWeek(allJobs), [allJobs]);
  const lastWeekJobs = useMemo(() => jobsLastWeek(allJobs), [allJobs]);

  const generate = useCallback(async () => {
    if (thisWeekJobs.length < 3) return;
    setBusy(true);

    const thisWeekEarnings = thisWeekJobs.reduce((s, j) => s + j.fare, 0);
    const lastWeekEarnings = lastWeekJobs.reduce((s, j) => s + j.fare, 0);
    const earningsChange =
      lastWeekEarnings > 0 ? ((thisWeekEarnings - lastWeekEarnings) / lastWeekEarnings) * 100 : 0;

    // Find best/worst jobs by rate per km
    const jobsWithRates = thisWeekJobs.map((j) => ({
      job: j,
      rate: j.distance > 0 ? j.fare / j.distance : 0,
    }));
    jobsWithRates.sort((a, b) => b.rate - a.rate);
    const bestJob = jobsWithRates[0]?.job;
    const worstJob = jobsWithRates[jobsWithRates.length - 1]?.job;

    // Local fallback in case Gemini API is not configured or fails
    const earningsMessage =
      lastWeekEarnings > 0
        ? `You earned ₹${thisWeekEarnings.toFixed(0)} this week (${earningsChange >= 0 ? "+" : ""}${earningsChange.toFixed(1)}% compared to last week).`
        : `You earned ₹${thisWeekEarnings.toFixed(0)} across ${thisWeekJobs.length} jobs this week.`;

    const bestWorstMessage =
      bestJob && worstJob
        ? ` Your best-paying ride was on ${bestJob.platform} (₹${(bestJob.fare / bestJob.distance).toFixed(1)}/km), while your lowest rate was on ${worstJob.platform} (₹${(worstJob.fare / worstJob.distance).toFixed(1)}/km).`
        : "";

    const flaggedCount = thisWeekJobs.filter((j) => fairness(j).flagged).length;
    const underpayMessage =
      flaggedCount > 0
        ? ` ${flaggedCount} of your jobs had potential underpayment; review night shifts and Zomato/Swiggy rates.`
        : " All your logged jobs this week matched or exceeded the fair benchmarks!";

    const fallback = `${earningsMessage}${bestWorstMessage}${underpayMessage}`;

    try {
      const structuredData = {
        currency: "INR",
        unit: "km",
        responseLanguage: language,
        thisWeek: thisWeekJobs.map((j) => ({
          platform: j.platform,
          vehicle: j.vehicleType,
          fareInr: j.fare,
          distanceKm: j.distance,
          rateInrPerKm: j.distance > 0 ? j.fare / j.distance : 0,
          flagged: fairness(j).flagged,
          hour: new Date(j.datetime).getHours(),
        })),
        lastWeek: lastWeekJobs.map((j) => ({
          platform: j.platform,
          vehicle: j.vehicleType,
          fareInr: j.fare,
          distanceKm: j.distance,
          rateInrPerKm: j.distance > 0 ? j.fare / j.distance : 0,
          flagged: fairness(j).flagged,
        })),
        earningsChangePercent: earningsChange,
      };
      const systemPrompt = `${GIGSHIELD_AI_SYSTEM_PROMPT} Respond in the selected UI language: ${language}. Always respond using Indian Rupees (₹) and kilometers (km). Never use dollars ($) or miles under any circumstance.`;
      const prompt = `Write a supportive, practical 2-4 sentence summary of the worker's week. Identify underpayment patterns by time, platform, or vehicle, compare earnings to last week, and explain what made the best-paying trip different from the lowest-rate trip. Use only the structured data below.\nStructured data: ${JSON.stringify(structuredData)}`;

      const result = await askWithFallbackDetailed(
        geminiApiKey,
        geminiModel,
        prompt,
        fallback,
        systemPrompt,
      );
      setInsight(result.answer);
    } catch {
      setInsight(fallback);
    }
    setBusy(false);
  }, [thisWeekJobs, lastWeekJobs, geminiApiKey, geminiModel, language]);

  // Auto-generate on mount / data change if threshold is met
  useEffect(() => {
    if (thisWeekJobs.length >= 3 && !busy) {
      void generate();
    }
  }, [thisWeekJobs.length, generate]);

  if (thisWeekJobs.length < 3) {
    return (
      <section className="mt-4 rounded-3xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
            🤖 {translate("AI Insight")}
          </span>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {translate("Log a few more jobs this week to unlock personalized insights.")}
        </p>
      </section>
    );
  }

  return (
    <section className="mt-4 rounded-3xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold">{translate("This Week's Insight")}</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
            🤖 AI Insight
          </span>
        </div>
        <button
          onClick={() => void generate()}
          disabled={busy}
          className="rounded-xl bg-secondary px-3.5 py-2 text-xs font-bold text-foreground border border-border hover:bg-secondary/80 disabled:opacity-50"
        >
          {busy ? translate("Analyzing…") : translate("Refresh insight")}
        </button>
      </div>
      {busy ? (
        <div className="mt-4 space-y-2 animate-pulse">
          <div className="h-4 bg-muted rounded w-3/4"></div>
          <div className="h-4 bg-muted rounded w-5/6"></div>
          <div className="h-4 bg-muted rounded w-2/3"></div>
        </div>
      ) : insight ? (
        <p className="mt-4 text-sm leading-6 text-foreground bg-secondary/40 rounded-2xl p-4 border border-border/40">
          {insight}
        </p>
      ) : null}
    </section>
  );
}

function ComplaintSupport({ flagged }: { flagged: Job[] }) {
  const { geminiApiKey, geminiModel } = useJobs();
  const { translate } = useI18n();
  const [selected, setSelected] = useState(flagged[0]?.id ?? "");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const job = flagged.find((item) => item.id === selected);
  async function createDraft() {
    if (!job) return;
    setBusy(true);
    const result = fairness(job);
    const fallback = `Subject: Request to review payout\n\nHello ${job.platform} Support,\n\nPlease review my payout of ₹${job.fare.toFixed(0)} for the ${job.distance} km ${result.vehicleType} job completed on ${new Date(job.datetime).toLocaleString("en-IN")}. It took ${job.minutes} minutes. GigShield's benchmark for ${result.vehicleType} is ₹${result.benchmark}/km (expected ₹${result.expected.toFixed(0)}). Actual rate was ₹${result.ratePerKm.toFixed(1)}/km, which is below the ₹${result.flagThreshold}/km threshold. Please verify the fare calculation and let me know if an adjustment is due.\n\nThank you.`;
    try {
      setDraft(
        (await askWithFallback(
          geminiApiKey,
          geminiModel,
          `Write a concise polite payout-review complaint. Include platform ${job.platform}, vehicle ${result.vehicleType}, date, fare ₹${job.fare}, distance ${job.distance} km, duration ${job.minutes} minutes, vehicle benchmark ₹${result.benchmark}/km, estimated fare ₹${result.expected}, and request a review.`,
          fallback,
        )) ?? fallback,
      );
    } catch {
      setDraft(fallback);
    }
    setBusy(false);
  }
  if (!flagged.length) return null;
  return (
    <section className="mt-8 rounded-3xl border border-destructive/30 bg-destructive/5 p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <AlertTriangle size={18} className="text-destructive" /> {translate("Payout support")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {translate("Create a copy-ready complaint for a job that may be underpaid.")}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-xl border border-input bg-secondary px-3 py-2 text-sm"
        >
          {flagged.map((item) => {
            const res = fairness(item);
            return (
              <option key={item.id} value={item.id}>
                {item.platform} ({res.vehicleType}) · ₹{item.fare} ·{" "}
                {new Date(item.datetime).toLocaleDateString("en-IN")}
              </option>
            );
          })}
        </select>
        <button
          onClick={() => void createDraft()}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
        >
          {busy ? translate("Writing…") : translate("Generate complaint")}
        </button>
      </div>
      {draft ? (
        <textarea
          readOnly
          value={draft}
          className="mt-4 min-h-48 w-full rounded-2xl border border-input bg-secondary p-3 text-sm leading-6"
        />
      ) : null}
    </section>
  );
}

function DailySavingsPlan({ jobs }: { jobs: Job[] }) {
  const { dailySavingTarget, setDailySavingTarget } = useJobs();
  const { translate } = useI18n();
  const week = jobsThisWeek(jobs);
  const earned = week.reduce((s, j) => s + j.fare, 0);
  const daysElapsed = Math.floor((Date.now() - startOfWeek().getTime()) / 86_400_000) + 1;
  const weekTarget = dailySavingTarget * daysElapsed;
  return (
    <div className="rounded-3xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Wallet size={18} /> {translate("Daily savings plan")}
      </h2>
      <label className="mt-1 block text-xs text-muted-foreground">
        {translate("Daily target")}
      </label>
      <div className="mt-2 flex gap-2">
        <input
          type="number"
          min="0"
          value={dailySavingTarget}
          onChange={(e) => setDailySavingTarget(Math.max(0, Number(e.target.value) || 0))}
          className="min-w-0 flex-1 rounded-xl border border-input bg-secondary px-3 py-2"
        />
        <span className="rounded-xl bg-secondary px-3 py-2">₹</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full ${earned >= weekTarget ? "bg-success" : "bg-primary"}`}
          style={{ width: `${weekTarget ? Math.min(100, (earned / weekTarget) * 100) : 0}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        ₹{earned.toFixed(0)} {translate("earned this week")} · {translate("This week's target")}: ₹
        {weekTarget.toFixed(0)}
      </p>
      <p className="mt-1 text-sm font-bold">
        {translate("Save today")}: ₹{dailySavingTarget.toFixed(0)} {translate("per day")}
      </p>
    </div>
  );
}

function AutoSetAside({ jobs }: { jobs: Job[] }) {
  const { autoSavePercent, setAutoSavePercent } = useJobs();
  const { translate } = useI18n();
  const setAside = jobs.reduce((s, j) => s + j.fare * (autoSavePercent / 100), 0);
  const rates = [0, 5, 10, 15, 20];
  return (
    <div className="rounded-3xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Percent size={18} /> {translate("Auto set-aside")}
      </h2>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {rates.map((rate) => (
          <button
            key={rate}
            onClick={() => setAutoSavePercent(rate)}
            className={`rounded-lg px-3 py-1.5 text-sm font-bold ${
              autoSavePercent === rate
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            {rate}%
          </button>
        ))}
      </div>
      <p className="mt-4 text-2xl font-extrabold">₹{setAside.toFixed(0)}</p>
      <p className="text-xs text-muted-foreground">
        {autoSavePercent > 0
          ? `${autoSavePercent}% ${translate("of every fare")}`
          : translate("Set-aside is off")}
      </p>
    </div>
  );
}

function ManualSavingsLog() {
  const { savingsLog, addSavingEntry, removeSavingEntry } = useJobs();
  const { translate } = useI18n();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const total = savingsLog.reduce((s, e) => s + e.amount, 0);
  const recent = [...savingsLog].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  return (
    <div className="rounded-3xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <PiggyBank size={18} /> {translate("Manual savings log")}
      </h2>
      <div className="mt-3 flex gap-2">
        <input
          type="number"
          min="0"
          inputMode="numeric"
          value={amount}
          placeholder="₹"
          onChange={(e) => setAmount(e.target.value)}
          className="w-24 rounded-xl border border-input bg-secondary px-3 py-2"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-input bg-secondary px-3 py-2"
        />
        <button
          onClick={() => {
            const value = Number(amount);
            if (value > 0 && date) addSavingEntry(value, date);
            setAmount("");
          }}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
        >
          {translate("Add")}
        </button>
      </div>
      {recent.length ? (
        <ul className="mt-3 space-y-1.5">
          {recent.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-2 rounded-xl bg-secondary px-3 py-2 text-sm"
            >
              <span className="text-muted-foreground">
                {new Date(`${entry.date}T00:00:00`).toLocaleDateString("en-IN", {
                  dateStyle: "medium",
                })}
              </span>
              <span className="font-bold">₹{entry.amount}</span>
              <button
                onClick={() => removeSavingEntry(entry.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label={translate("Delete job")}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">{translate("No savings yet")}</p>
      )}
      <p className="mt-3 text-2xl font-extrabold">₹{total.toFixed(0)}</p>
      <p className="text-xs text-muted-foreground">{translate("Saved so far")}</p>
    </div>
  );
}

function TodayProfitLoss({ jobs }: { jobs: Job[] }) {
  const { translate } = useI18n();
  const today = jobs.filter(
    (job) => new Date(job.datetime).toDateString() === new Date().toDateString(),
  );
  const profit = today.reduce((s, job) => s + job.fare, 0);
  const loss = today.reduce(
    (s, job) => s + (fairness(job).flagged ? Math.max(0, fairness(job).expected - job.fare) : 0),
    0,
  );
  const net = profit - loss;
  return (
    <div className="rounded-3xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <TrendingUp size={18} /> {translate("Today's profit & loss")}
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-secondary p-3">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp size={13} /> {translate("Profit today")}
          </p>
          <p className="mt-1 text-xl font-extrabold text-success">₹{profit.toFixed(0)}</p>
        </div>
        <div className="rounded-2xl bg-secondary p-3">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingDown size={13} /> {translate("Loss today")}
          </p>
          <p className="mt-1 text-xl font-extrabold text-destructive">₹{loss.toFixed(0)}</p>
        </div>
      </div>
      <p className="mt-3 text-sm">
        <b>{translate("Net today")}:</b>{" "}
        <span className={`font-bold ${net >= 0 ? "text-success" : "text-destructive"}`}>
          ₹{net.toFixed(0)}
        </span>
      </p>
    </div>
  );
}

function SafetyAndSavings({ jobs }: { jobs: Job[] }) {
  const { savingsGoal, setSavingsGoal, resetSetup } = useJobs();
  const { translate } = useI18n();
  const earned = jobs.reduce((s, j) => s + j.fare, 0);
  const hours = jobs.reduce((s, j) => s + j.minutes, 0) / 60;
  const [alertReady, setAlertReady] = useState(false);
  return (
    <section className="mt-8 grid gap-3 md:grid-cols-2">
      <div className="rounded-3xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Target size={18} /> {translate("Savings goal")}
        </h2>
        <div className="mt-4 flex gap-2">
          <input
            type="number"
            min="0"
            value={savingsGoal}
            onChange={(e) => setSavingsGoal(Number(e.target.value))}
            className="min-w-0 flex-1 rounded-xl border border-input bg-secondary px-3 py-2"
          />
          <span className="rounded-xl bg-secondary px-3 py-2">₹</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-success"
            style={{ width: `${savingsGoal ? Math.min(100, (earned / savingsGoal) * 100) : 0}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          ₹{earned.toFixed(0)} {translate("earned toward")} ₹{savingsGoal.toFixed(0)}{" "}
          {translate("goal")}
        </p>
      </div>
      <DailySavingsPlan jobs={jobs} />
      <AutoSetAside jobs={jobs} />
      <ManualSavingsLog />
      <TodayProfitLoss jobs={jobs} />
      <div className="rounded-3xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <ShieldAlert size={18} /> {translate("Safety check")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {translate("One tap prepares a message for a trusted contact.")}
        </p>
        {hours > 10 ? (
          <p className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
            {translate("You recorded")} {hours.toFixed(1)} {translate("hours")}.{" "}
            {translate("Please take a break and avoid riding exhausted.")}
          </p>
        ) : null}
        <button
          onClick={() => setAlertReady(true)}
          className="mt-4 w-full rounded-xl border border-destructive/40 px-4 py-2 font-bold text-destructive hover:bg-destructive/10"
        >
          🚨 {translate("I feel unsafe")}
        </button>
        {alertReady ? (
          <div className="mt-3 rounded-xl bg-secondary p-3 text-sm">
            <b>{translate("Alert prepared:")}</b>
            <p className="mt-1">
              {translate("I may be unsafe. Please call me and check my live location.")}
            </p>
            <button
              onClick={() =>
                navigator.clipboard?.writeText(
                  "I may be unsafe. Please call me and check my live location.",
                )
              }
              className="mt-2 text-xs font-bold underline"
            >
              {translate("Copy alert")}
            </button>
          </div>
        ) : null}
      </div>
      <button
        onClick={resetSetup}
        className="text-left text-xs text-muted-foreground underline md:col-span-2"
      >
        {translate("Reset worker setup and start over")}
      </button>
    </section>
  );
}

function Dashboard() {
  const { jobs, setupComplete, jobsToLog, removeJob } = useJobs();
  const { translate } = useI18n();
  const week = jobsThisWeek(jobs);
  const [period, setPeriod] = useState<"week" | "all">("week");
  const scoped = period === "week" ? week : jobs;
  const earnings = scoped.reduce((s, j) => s + j.fare, 0);
  const hours = scoped.reduce((s, j) => s + j.minutes, 0) / 60;
  const flagged = scoped.filter((j) => fairness(j).flagged);
  const chart = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const day = new Date();
        day.setDate(day.getDate() - (6 - index));
        return {
          label: day.toLocaleDateString("en-IN", { weekday: "short" }),
          value: scoped
            .filter((j) => new Date(j.datetime).toDateString() === day.toDateString())
            .reduce((s, j) => s + j.fare, 0),
        };
      }),
    [scoped],
  );
  if (!setupComplete) return <Setup />;
  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{translate("Your earnings")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {jobs.length} {translate("recorded")} · {Math.min(jobs.length, jobsToLog)}{" "}
            {translate("of")} {jobsToLog} {translate("planned jobs")}·{" "}
            {translate("Fair-pay benchmarks vary by vehicle — see each job for details")}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/assistant"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-bold"
          >
            <MessageCircle size={16} /> {translate("AI chat")}
          </Link>
          <Link
            to="/log"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
          >
            <IndianRupee size={16} /> {translate("Log job")}
          </Link>
        </div>
      </div>
      <div className="mt-4 inline-flex rounded-xl border border-border bg-card p-1">
        {(["week", "all"] as const).map((item) => (
          <button
            key={item}
            onClick={() => setPeriod(item)}
            className={`rounded-lg px-4 py-2 text-sm font-bold ${period === item ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            {item === "week" ? translate("This week") : translate("All time")}
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label={translate("Earnings")}
          value={earnings}
          prefix="₹"
          hint={`${scoped.length} ${translate("jobs")}`}
          icon={IndianRupee}
          tone="violet"
        />
        <StatCard
          label={translate("Hours worked")}
          value={hours}
          decimals={1}
          suffix=" h"
          hint={
            hours
              ? `₹${(earnings / hours).toFixed(0)}/${translate("hr")}`
              : translate("no time logged")
          }
          icon={Clock}
          tone="teal"
          delay={80}
        />
        <StatCard
          label={translate("Possible underpayment")}
          value={flagged.length}
          hint={translate("review recommended")}
          icon={AlertTriangle}
          tone="amber"
          delay={160}
        />
      </div>
      <ThisWeeksInsight />
      <div className="mt-3 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <EarningsChart data={chart} />
        <FairnessRing fair={scoped.length - flagged.length} flagged={flagged.length} />
      </div>
      <ComplaintSupport flagged={flagged} />
      <SafetyAndSavings jobs={jobs} />
      <h2 className="mt-8 text-lg font-bold">{translate("All jobs")}</h2>
      {jobs.length ? (
        <div className="mt-4 overflow-x-auto rounded-3xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {[
                  "Date",
                  "Platform & Vehicle",
                  "Fare",
                  "Distance",
                  "Time",
                  "Applied Benchmark",
                  "Status",
                  "",
                ].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium">
                    {translate(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const result = fairness(job);
                return (
                  <tr key={job.id} className="border-b border-border/60 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {new Date(job.datetime).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold">{job.platform}</div>
                      <div className="text-xs text-muted-foreground">{result.vehicleType}</div>
                    </td>
                    <td className="px-4 py-3 font-semibold">₹{job.fare}</td>
                    <td className="px-4 py-3">{job.distance} km</td>
                    <td className="px-4 py-3">{job.minutes} m</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {translate("Benchmark")}: ₹{result.benchmark}/km ({result.vehicleType})
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {translate("Expected")}: ₹{result.expected.toFixed(0)} (
                        {translate("Actual")}: ₹{result.ratePerKm.toFixed(1)}/km)
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {result.benchmarkSource === "community"
                          ? `${translate("Community data")}: ${result.communitySampleSize} ${translate("workers")}`
                          : translate("Vehicle baseline")}
                      </div>
                    </td>
                    <td
                      className={`px-4 py-3 font-bold ${result.flagged ? "text-destructive" : "text-success"}`}
                    >
                      {result.flagged
                        ? `⚠️ ${translate("Possible underpayment")}`
                        : `✅ ${translate("Fair")}`}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => removeJob(job.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Delete job"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {translate("No jobs yet. Start with manual entry or screenshot scan.")}
        </div>
      )}
    </AppShell>
  );
}
