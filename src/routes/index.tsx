import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Clock,
  IndianRupee,
  MessageCircle,
  ShieldAlert,
  Target,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EarningsChart } from "@/components/EarningsChart";
import { FairnessRing } from "@/components/FairnessRing";
import { StatCard } from "@/components/StatCard";
import { askGemini, jobsContext } from "@/lib/ai";
import { benchmarkFor, fairness, jobsThisWeek, useJobs, type Job } from "@/lib/jobs-store";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "GigShield — Fair Pay, Safety and Worker Support" }] }),
  component: Dashboard,
});

function Setup() {
  const { completeSetup } = useJobs();
  const [count, setCount] = useState(1);
  return (
    <AppShell>
      <div className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-6 sm:p-8">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-xl font-black text-primary-foreground">
          G
        </div>
        <h1 className="mt-5 text-3xl font-extrabold tracking-tight">Let’s record your work</h1>
        <p className="mt-2 text-muted-foreground">
          How many jobs are you working or recording today? You can add more later.
        </p>
        <label className="mt-6 block text-sm font-bold">
          Number of jobs
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
          For every job you can enter fare, distance and time manually, or scan an app screenshot
          with OCR.
        </p>
        <button
          onClick={() => completeSetup(count)}
          className="mt-6 w-full rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground"
        >
          Start logging jobs
        </button>
      </div>
    </AppShell>
  );
}

function WeeklyInsight({ jobs }: { jobs: Job[] }) {
  const { geminiApiKey, geminiModel } = useJobs();
  const [insight, setInsight] = useState("");
  const [busy, setBusy] = useState(false);
  async function generate() {
    setBusy(true);
    const fallback = `You earned ₹${jobs.reduce((s, j) => s + j.fare, 0).toFixed(0)} across ${jobs.length} jobs and worked ${(jobs.reduce((s, j) => s + j.minutes, 0) / 60).toFixed(1)} hours. ${jobs.filter((j) => fairness(j).flagged).length} job(s) may be underpaid. Keep screenshots and review low-paying shifts.`;
    try {
      const answer = await askGemini(
        geminiApiKey,
        geminiModel,
        `Create a short, encouraging weekly insight for a gig worker. Mention earnings, hours, average hourly earning, flagged jobs, platform/night pattern, and one action. Do not invent data. Call fairness an estimate. Data: ${jobsContext(jobs)}`,
      );
      setInsight(answer ?? fallback);
    } catch {
      setInsight(fallback);
    }
    setBusy(false);
  }
  return (
    <section className="mt-8 rounded-3xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Weekly AI insight</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Turn your numbers into a simple action plan.
          </p>
        </div>
        <button
          onClick={() => void generate()}
          disabled={busy || jobs.length === 0}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Generating…" : "Generate insight"}
        </button>
      </div>
      {insight ? (
        <p className="mt-4 rounded-2xl bg-secondary p-4 text-sm leading-6">{insight}</p>
      ) : null}
    </section>
  );
}

function ComplaintSupport({ flagged }: { flagged: Job[] }) {
  const { geminiApiKey, geminiModel } = useJobs();
  const [selected, setSelected] = useState(flagged[0]?.id ?? "");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const job = flagged.find((item) => item.id === selected);
  async function createDraft() {
    if (!job) return;
    setBusy(true);
    const result = fairness(job);
    const fallback = `Subject: Request to review payout\n\nHello ${job.platform} Support,\n\nPlease review my payout of ₹${job.fare.toFixed(0)} for the ${job.distance} km job completed on ${new Date(job.datetime).toLocaleString("en-IN")}. It took ${job.minutes} minutes. GigShield estimates a fair payout of ₹${result.expected.toFixed(0)} using a transparent benchmark. Please verify the fare calculation and let me know if an adjustment is due.\n\nThank you.`;
    try {
      setDraft(
        (await askGemini(
          geminiApiKey,
          geminiModel,
          `Write a concise polite payout-review complaint. Include platform, date, fare ₹${job.fare}, distance ${job.distance} km, duration ${job.minutes} minutes, estimated fare ₹${result.expected}, and request a review.`,
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
        <AlertTriangle size={18} className="text-destructive" /> Payout support
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Create a copy-ready complaint for a job that may be underpaid.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-xl border border-input bg-secondary px-3 py-2 text-sm"
        >
          {flagged.map((item) => (
            <option key={item.id} value={item.id}>
              {item.platform} · ₹{item.fare} · {new Date(item.datetime).toLocaleDateString("en-IN")}
            </option>
          ))}
        </select>
        <button
          onClick={() => void createDraft()}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
        >
          {busy ? "Writing…" : "Generate complaint"}
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

function SafetyAndSavings({ jobs }: { jobs: Job[] }) {
  const { savingsGoal, setSavingsGoal, resetSetup } = useJobs();
  const earned = jobs.reduce((s, j) => s + j.fare, 0);
  const hours = jobs.reduce((s, j) => s + j.minutes, 0) / 60;
  const [alertReady, setAlertReady] = useState(false);
  return (
    <section className="mt-8 grid gap-3 md:grid-cols-2">
      <div className="rounded-3xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Target size={18} /> Savings goal
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
          ₹{earned.toFixed(0)} earned toward ₹{savingsGoal.toFixed(0)} goal
        </p>
      </div>
      <div className="rounded-3xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <ShieldAlert size={18} /> Safety check
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          One tap prepares a message for a trusted contact.
        </p>
        {hours > 10 ? (
          <p className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
            You recorded {hours.toFixed(1)} hours. Please take a break and avoid riding exhausted.
          </p>
        ) : null}
        <button
          onClick={() => setAlertReady(true)}
          className="mt-4 w-full rounded-xl border border-destructive/40 px-4 py-2 font-bold text-destructive hover:bg-destructive/10"
        >
          🚨 I feel unsafe
        </button>
        {alertReady ? (
          <div className="mt-3 rounded-xl bg-secondary p-3 text-sm">
            <b>Alert prepared:</b>
            <p className="mt-1">I may be unsafe. Please call me and check my live location.</p>
            <button
              onClick={() =>
                navigator.clipboard?.writeText(
                  "I may be unsafe. Please call me and check my live location.",
                )
              }
              className="mt-2 text-xs font-bold underline"
            >
              Copy alert
            </button>
          </div>
        ) : null}
      </div>
      <button
        onClick={resetSetup}
        className="text-left text-xs text-muted-foreground underline md:col-span-2"
      >
        Reset worker setup and start over
      </button>
    </section>
  );
}

function Dashboard() {
  const { jobs, setupComplete, jobsToLog, removeJob } = useJobs();
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
          <h1 className="text-2xl font-extrabold tracking-tight">Your earnings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {jobs.length} recorded · {Math.min(jobs.length, jobsToLog)} of {jobsToLog} planned jobs
            · estimates are not legal proof
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/assistant"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-bold"
          >
            <MessageCircle size={16} /> AI chat
          </Link>
          <Link
            to="/log"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
          >
            <IndianRupee size={16} /> Log job
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
            {item === "week" ? "This week" : "All time"}
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Earnings"
          value={earnings}
          prefix="₹"
          hint={`${scoped.length} jobs`}
          icon={IndianRupee}
          tone="violet"
        />
        <StatCard
          label="Hours worked"
          value={hours}
          decimals={1}
          suffix=" h"
          hint={hours ? `₹${(earnings / hours).toFixed(0)}/hr` : "no time logged"}
          icon={Clock}
          tone="teal"
          delay={80}
        />
        <StatCard
          label="Possible underpayment"
          value={flagged.length}
          hint="review recommended"
          icon={AlertTriangle}
          tone="amber"
          delay={160}
        />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <EarningsChart data={chart} />
        <FairnessRing fair={scoped.length - flagged.length} flagged={flagged.length} />
      </div>
      <WeeklyInsight jobs={scoped} />
      <ComplaintSupport flagged={flagged} />
      <SafetyAndSavings jobs={jobs} />
      <h2 className="mt-8 text-lg font-bold">All jobs</h2>
      {jobs.length ? (
        <div className="mt-4 overflow-x-auto rounded-3xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {["Date", "Platform", "Fare", "Distance", "Time", "Estimate", "Status", ""].map(
                  (h) => (
                    <th key={h} className="px-4 py-3 font-medium">
                      {h}
                    </th>
                  ),
                )}
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
                    <td className="px-4 py-3 font-bold">{job.platform}</td>
                    <td className="px-4 py-3 font-semibold">₹{job.fare}</td>
                    <td className="px-4 py-3">{job.distance} km</td>
                    <td className="px-4 py-3">{job.minutes} m</td>
                    <td className="px-4 py-3">₹{result.expected.toFixed(0)}</td>
                    <td
                      className={`px-4 py-3 font-bold ${result.flagged ? "text-destructive" : "text-success"}`}
                    >
                      {result.flagged ? "⚠️ Possible underpayment" : "✅ Fair"}
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
          No jobs yet. Start with manual entry or screenshot scan.
        </div>
      )}
    </AppShell>
  );
}
