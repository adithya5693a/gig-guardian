import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Platform = "Zomato" | "Swiggy" | "Uber" | "Ola" | "Other";

export type Job = {
  id: string;
  platform: Platform;
  fare: number;
  distance: number;
  minutes: number;
  datetime: string;
  area?: string;
  nightShift?: boolean;
  source?: "manual" | "ocr";
};

export const FAIR_RATE_REFERENCE: Record<
  Platform,
  { day: [number, number, number]; night: [number, number, number] }
> = {
  Zomato: { day: [28, 11, 1.8], night: [32, 13, 2.2] },
  Swiggy: { day: [28, 11, 1.8], night: [32, 13, 2.2] },
  Uber: { day: [40, 14, 2.4], night: [45, 16, 2.8] },
  Ola: { day: [40, 14, 2.4], night: [45, 16, 2.8] },
  Other: { day: [30, 12, 2], night: [34, 14, 2.3] },
};

export function benchmarkFor(platform: Platform, nightShift: boolean) {
  const [base, perKm, perMinute] = FAIR_RATE_REFERENCE[platform][nightShift ? "night" : "day"];
  return { base, perKm, perMinute };
}

export function expectedFare(job: Pick<Job, "platform" | "distance" | "minutes" | "nightShift">) {
  const rate = benchmarkFor(job.platform, Boolean(job.nightShift));
  return (
    Math.round((rate.base + job.distance * rate.perKm + job.minutes * rate.perMinute) * 100) / 100
  );
}

export function ratePerKm(job: Job) {
  return job.distance > 0 ? job.fare / job.distance : 0;
}

export function fairness(
  job: Pick<Job, "platform" | "fare" | "distance" | "minutes" | "nightShift">,
) {
  const expected = expectedFare(job);
  const ratio = expected > 0 ? job.fare / expected : 0;
  return {
    expected,
    ratio,
    status:
      ratio >= 0.9 ? "Fair" : ratio >= 0.75 ? "Slightly below expected" : "Possible underpayment",
    flagged: ratio < 0.75,
  } as const;
}

export function isFair(job: Job) {
  return !fairness(job).flagged;
}

type JobsContextValue = {
  jobs: Job[];
  jobsToLog: number;
  setupComplete: boolean;
  savingsGoal: number;
  geminiApiKey: string;
  geminiModel: string;
  addJob: (job: Omit<Job, "id">) => void;
  removeJob: (id: string) => void;
  completeSetup: (jobsToLog: number) => void;
  resetSetup: () => void;
  setSavingsGoal: (goal: number) => void;
  setGeminiApiKey: (key: string) => void;
  setGeminiModel: (model: string) => void;
};

const JobsContext = createContext<JobsContextValue | null>(null);

const storageKey = "gigshield-state-v2";

export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsToLog, setJobsToLog] = useState(1);
  const [setupComplete, setSetupComplete] = useState(false);
  const [savingsGoal, setSavingsGoal] = useState(5000);
  const [geminiApiKey, setGeminiApiKey] = useState(() => import.meta.env.VITE_GEMINI_API_KEY ?? "");
  const [geminiModel, setGeminiModel] = useState(
    () => import.meta.env.VITE_GEMINI_MODEL ?? "gemini-2.0-flash",
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (saved) {
        setJobs(saved.jobs ?? []);
        setJobsToLog(saved.jobsToLog ?? 1);
        setSetupComplete(Boolean(saved.setupComplete));
        setSavingsGoal(saved.savingsGoal ?? 5000);
        setGeminiModel(saved.geminiModel ?? "gemini-2.0-flash");
      }
    } catch {
      // A fresh in-memory session is still usable when storage is unavailable.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      storageKey,
      JSON.stringify({ jobs, jobsToLog, setupComplete, savingsGoal, geminiModel }),
    );
  }, [hydrated, jobs, jobsToLog, setupComplete, savingsGoal, geminiModel]);

  const value = useMemo<JobsContextValue>(
    () => ({
      jobs,
      jobsToLog,
      setupComplete,
      savingsGoal,
      geminiApiKey,
      geminiModel,
      addJob: (job) =>
        setJobs((prev) =>
          [{ ...job, id: crypto.randomUUID() }, ...prev].sort(
            (a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime(),
          ),
        ),
      removeJob: (id) => setJobs((prev) => prev.filter((job) => job.id !== id)),
      completeSetup: (count) => {
        setJobsToLog(count);
        setSetupComplete(true);
      },
      resetSetup: () => {
        setJobs([]);
        setSetupComplete(false);
        setJobsToLog(1);
      },
      setSavingsGoal,
      setGeminiApiKey,
      setGeminiModel,
    }),
    [jobs, jobsToLog, setupComplete, savingsGoal, geminiApiKey, geminiModel],
  );

  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>;
}

export function useJobs() {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error("useJobs must be used inside JobsProvider");
  return ctx;
}

export function startOfWeek(d = new Date()) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day);
  return date;
}

export function jobsThisWeek(jobs: Job[]) {
  const start = startOfWeek();
  return jobs.filter((job) => new Date(job.datetime) >= start);
}
