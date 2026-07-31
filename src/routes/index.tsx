import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { FairnessBadge } from "@/components/FairnessBadge";
import {
  BENCHMARK_PER_KM,
  jobsThisWeek,
  ratePerKm,
  useJobs,
} from "@/lib/jobs-store";

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

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Dashboard() {
  const { jobs, removeJob } = useJobs();
  const week = jobsThisWeek(jobs);
  const earnings = week.reduce((s, j) => s + j.fare, 0);
  const hours = week.reduce((s, j) => s + j.minutes, 0) / 60;
  const flagged = jobs.filter((j) => ratePerKm(j) < BENCHMARK_PER_KM * 0.8).length;

  return (
    <AppShell>
      <h1 className="text-2xl font-extrabold tracking-tight">This week</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Fair-pay benchmark: ₹{BENCHMARK_PER_KM}/km · flag below 80% (₹{BENCHMARK_PER_KM * 0.8}/km)
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Earnings" value={`₹${earnings.toFixed(0)}`} hint={`${week.length} jobs`} />
        <StatCard label="Hours worked" value={`${hours.toFixed(1)} h`} />
        <StatCard
          label="Flagged jobs"
          value={String(flagged)}
          hint="all time"
        />
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight">All jobs</h2>
        <Link
          to="/log"
          className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          + Log job
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No jobs yet. Log your first trip to see fairness checks.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="mt-4 space-y-3 sm:hidden">
            {jobs.map((j) => (
              <li key={j.id} className="rounded-2xl border border-border bg-card p-4">
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
                  <FairnessBadge job={j} />
                  <button
                    onClick={() => removeJob(j.id)}
                    className="text-xs font-medium text-muted-foreground hover:text-destructive"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-border bg-card sm:block">
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
                  <tr key={j.id} className="border-b border-border/60 last:border-0">
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
                      <FairnessBadge job={j} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => removeJob(j.id)}
                        className="text-xs font-medium text-muted-foreground hover:text-destructive"
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
