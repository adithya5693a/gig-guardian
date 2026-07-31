import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Clock, IndianRupee, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { EarningsChart, type ChartPoint } from "@/components/EarningsChart";
import { FairnessRing } from "@/components/FairnessRing";
import { BENCHMARK_PER_KM, isFair, ratePerKm, startOfWeek, useJobs, type Job } from "@/lib/jobs-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GigShield Dashboard — Weekly Earnings & Fair Pay Check" },
      {
        name: "description",
        content:
          "Track your gig earnings, hours worked this week and instantly spot rides or deliveries paid below the ₹15/km fair-pay benchmark.",
      },
      { property: "og:title", content: "GigShield Dashboard — Weekly Earnings & Fair Pay Check" },
      {
        property: "og:description",
        content:
          "Weekly earnings, hours worked and per-job underpayment flags for delivery riders and cab drivers.",
      },
    ],
  }),
  component: Dashboard,
});

type Period = "week" | "month" | "all";

const PERIODS: { id: Period; label: string }[] = [
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
  { id: "all", label: "All Time" },
];

function periodStart(period: Period) {
  if (period === "week") return startOfWeek();
  if (period === "month") {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
  return new Date(0);
}

function Badge({ fair }: { fair: boolean }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide " +
        (fair
          ? "bg-success/20 text-success ring-1 ring-success/30"
          : "bg-destructive/20 text-destructive ring-1 ring-destructive/30")
      }
    >
      <span className={"h-1.5 w-1.5 rounded-full " + (fair ? "bg-success" : "bg-destructive")} />
      {fair ? "Fair" : "Underpaid"}
    </span>
  );
}

function buildChart(jobs: Job[], period: Period): ChartPoint[] {
  if (period === "week") {
    const start = startOfWeek();
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const next = new Date(day);
      next.setDate(day.getDate() + 1);
      const value = jobs
        .filter((j) => {
          const t = new Date(j.datetime);
          return t >= day && t < next;
        })
        .reduce((s, j) => s + j.fare, 0);
      return { label: day.toLocaleDateString("en-IN", { weekday: "short" }).slice(0, 3), value };
    });
  }

  if (period === "month") {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const weeks = Math.ceil(days / 7);
    return Array.from({ length: weeks }, (_, i) => {
      const from = new Date(start);
      from.setDate(1 + i * 7);
      const to = new Date(from);
      to.setDate(from.getDate() + 7);
      const value = jobs
        .filter((j) => {
          const t = new Date(j.datetime);
          return t >= from && t < to;
        })
        .reduce((s, j) => s + j.fare, 0);
      return { label: `W${i + 1}`, value };
    });
  }

  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const from = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
    const value = jobs
      .filter((j) => {
        const t = new Date(j.datetime);
        return t >= from && t < to;
      })
      .reduce((s, j) => s + j.fare, 0);
    return { label: from.toLocaleDateString("en-IN", { month: "short" }), value };
  });
}

function Dashboard() {
  const { jobs, removeJob } = useJobs();
  const [period, setPeriod] = useState<Period>("week");

  const scoped = useMemo(() => {
    const start = periodStart(period);
    return jobs.filter((j) => new Date(j.datetime) >= start);
  }, [jobs, period]);

  const earnings = scoped.reduce((s, j) => s + j.fare, 0);
  const hours = scoped.reduce((s, j) => s + j.minutes, 0) / 60;
  const flagged = scoped.filter((j) => !isFair(j)).length;
  const fair = scoped.length - flagged;
  const chart = useMemo(() => buildChart(jobs, period), [jobs, period]);

  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const j of scoped) {
      const key = new Date(j.datetime).toDateString();
      map.set(key, (map.get(key) ?? 0) + j.fare);
    }
    const entries = [...map.entries()].sort((a, b) => b[1] - a[1]);
    return { best: entries[0], worst: entries[entries.length - 1] };
  }, [scoped]);

  const fmtDay = (key: string) =>
    new Date(key).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Your earnings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Benchmark ₹{BENCHMARK_PER_KM}/km · flagged below ₹{BENCHMARK_PER_KM * 0.8}/km
          </p>
        </div>
        <Link
          to="/log"
          className="animate-soft-pulse inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-transform duration-200 hover:scale-105"
        >
          <Plus size={16} /> Log job
        </Link>
      </div>

      <div className="mt-4 inline-flex w-full max-w-md rounded-full border border-border bg-card p-1 sm:w-auto">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={
              "flex-1 whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition-all duration-200 sm:text-sm " +
              (period === p.id
                ? "bg-gradient-violet text-white shadow-glow-violet"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {p.label}
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
          hint={hours > 0 ? `₹${(earnings / Math.max(hours, 0.01)).toFixed(0)}/hr` : "no time logged"}
          icon={Clock}
          tone="teal"
          delay={80}
        />
        <StatCard
          label="Flagged jobs"
          value={flagged}
          hint="possible underpayment"
          icon={AlertTriangle}
          tone="amber"
          delay={160}
        />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr]">
        <EarningsChart data={chart} />
        <FairnessRing fair={fair} flagged={flagged} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="animate-rise flex items-center gap-3 rounded-3xl border border-border bg-card p-4 transition-shadow duration-300 hover:shadow-glow-teal">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-success/15 text-success">
            <ArrowUpRight size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Best day</p>
            <p className="truncate text-sm font-bold">
              {byDay.best ? `${fmtDay(byDay.best[0])} · ₹${byDay.best[1].toFixed(0)}` : "—"}
            </p>
          </div>
        </div>
        <div className="animate-rise flex items-center gap-3 rounded-3xl border border-border bg-card p-4 transition-shadow duration-300 hover:shadow-glow-amber">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-destructive/15 text-destructive">
            <ArrowDownRight size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Worst day</p>
            <p className="truncate text-sm font-bold">
              {byDay.worst ? `${fmtDay(byDay.worst[0])} · ₹${byDay.worst[1].toFixed(0)}` : "—"}
            </p>
          </div>
        </div>
      </div>

      <h2 className="mt-8 text-lg font-bold tracking-tight">All jobs</h2>

      {jobs.length === 0 ? (
        <div className="mt-4 rounded-3xl border border-dashed border-border bg-card/50 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No jobs yet. Log your first trip to see fairness checks.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="mt-4 space-y-3 sm:hidden">
            {jobs.map((j, i) => (
              <li
                key={j.id}
                style={{ animationDelay: `${i * 40}ms` }}
                className="animate-rise rounded-3xl border border-border bg-card p-4 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-glow-violet"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{j.platform}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(j.datetime).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                  <p className="shrink-0 text-lg font-extrabold">₹{j.fare}</p>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {j.distance} km · {j.minutes} min · ₹{ratePerKm(j).toFixed(1)}/km
                </p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <Badge fair={isFair(j)} />
                  <button
                    onClick={() => removeJob(j.id)}
                    className="text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          <div className="animate-rise mt-4 hidden overflow-x-auto rounded-3xl border border-border bg-card sm:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Platform</th>
                  <th className="px-4 py-3 font-medium">Fare</th>
                  <th className="px-4 py-3 font-medium">Dist</th>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">₹/km</th>
                  <th className="px-4 py-3 font-medium">Fairness</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr
                    key={j.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {new Date(j.datetime).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-4 py-3 font-medium">{j.platform}</td>
                    <td className="px-4 py-3 font-semibold">₹{j.fare}</td>
                    <td className="px-4 py-3">{j.distance} km</td>
                    <td className="px-4 py-3">{j.minutes} m</td>
                    <td className="px-4 py-3">₹{ratePerKm(j).toFixed(1)}</td>
                    <td className="px-4 py-3">
                      <Badge fair={isFair(j)} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => removeJob(j.id)}
                        className="text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AppShell>
  );
}
