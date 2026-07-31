import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useJobs } from "@/lib/jobs-store";

export const Route = createFileRoute("/log")({
  head: () => ({
    meta: [
      { title: "Log a Job — GigShield Earnings Tracker" },
      {
        name: "description",
        content:
          "Add a delivery or ride in seconds: platform, fare, distance, time taken and date, then check it against the fair-pay benchmark.",
      },
      { property: "og:title", content: "Log a Job — GigShield Earnings Tracker" },
      {
        property: "og:description",
        content: "Add a delivery or ride and check it against the ₹15/km fair-pay benchmark.",
      },
    ],
  }),
  component: LogJob,
});

const PLATFORMS = ["Zomato", "Swiggy", "Uber", "Ola", "Other"];

function localNow() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const fieldClass =
  "mt-1 w-full rounded-xl border border-input bg-secondary px-3 py-2.5 text-base text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30";

function LogJob() {
  const { addJob } = useJobs();
  const navigate = useNavigate();
  const [platform, setPlatform] = useState(PLATFORMS[0]);
  const [fare, setFare] = useState("");
  const [distance, setDistance] = useState("");
  const [minutes, setMinutes] = useState("");
  const [datetime, setDatetime] = useState(localNow());
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const f = Number(fare);
    const d = Number(distance);
    const m = Number(minutes);
    if (!(f > 0) || !(d > 0) || !(m > 0) || !datetime) {
      setError("Enter a fare, distance, time and date greater than zero.");
      return;
    }
    addJob({ platform, fare: f, distance: d, minutes: m, datetime });
    navigate({ to: "/" });
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-extrabold tracking-tight">Log a job</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Takes 10 seconds. We'll check the rate against ₹15/km.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-6">
        <label className="block">
          <span className="text-sm font-medium">Platform</span>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={fieldClass}>
            {PLATFORMS.map((p) => (
              <option key={p} value={p} className="bg-card">
                {p}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium">Fare amount (₹)</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={fare}
            onChange={(e) => setFare(e.target.value)}
            placeholder="180"
            className={fieldClass}
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium">Distance (km)</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              placeholder="12"
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Time (min)</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="35"
              className={fieldClass}
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium">Date & time</span>
          <input
            type="datetime-local"
            value={datetime}
            onChange={(e) => setDatetime(e.target.value)}
            className={fieldClass}
          />
        </label>

        {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}

        <button
          type="submit"
          className="w-full rounded-xl bg-primary px-4 py-3 text-base font-bold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Save job
        </button>
      </form>
    </AppShell>
  );
}
