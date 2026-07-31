import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Platform = "Zomato" | "Swiggy" | "Uber" | "Ola" | "Rapido" | "Other";

export type VehicleType = "Bike" | "Auto" | "Car (Non-AC)" | "Car (AC/Premium)";

export type Job = {
  id: string;
  platform: Platform;
  vehicleType: VehicleType;
  fare: number;
  distance: number;
  minutes: number;
  datetime: string;
  area?: string;
  nightShift?: boolean;
  source?: "manual" | "ocr";
};

export const VEHICLE_BENCHMARKS: Record<
  VehicleType,
  { benchmark: number; flagThreshold: number }
> = {
  Bike: { benchmark: 15, flagThreshold: 12 },
  Auto: { benchmark: 18, flagThreshold: 14 },
  "Car (Non-AC)": { benchmark: 22, flagThreshold: 17 },
  "Car (AC/Premium)": { benchmark: 28, flagThreshold: 22 },
};

export function isRideHailingPlatform(platform: Platform): boolean {
  return platform !== "Zomato" && platform !== "Swiggy";
}

export function getVehicleType(job: { vehicleType?: VehicleType }): VehicleType {
  return job.vehicleType ?? "Bike";
}

export function benchmarkForVehicle(vehicleType: VehicleType = "Bike") {
  return VEHICLE_BENCHMARKS[vehicleType] ?? VEHICLE_BENCHMARKS.Bike;
}

export function expectedFare(job: { distance: number; vehicleType?: VehicleType }) {
  const { benchmark } = benchmarkForVehicle(getVehicleType(job));
  return Math.round(job.distance * benchmark * 100) / 100;
}

export function ratePerKm(job: Pick<Job, "fare" | "distance">) {
  return job.distance > 0 ? job.fare / job.distance : 0;
}

export function fairness(
  job: Pick<Job, "fare" | "distance"> & { vehicleType?: VehicleType },
) {
  const vehicleType = getVehicleType(job);
  const { benchmark, flagThreshold } = benchmarkForVehicle(vehicleType);
  const expected = Math.round(job.distance * benchmark * 100) / 100;
  const rate = ratePerKm(job);
  const flagged = job.distance > 0 && rate < flagThreshold;

  return {
    expected,
    benchmark,
    flagThreshold,
    vehicleType,
    ratePerKm: rate,
    status: flagged ? "Possible underpayment" : "Fair",
    flagged,
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
        const rawJobs = Array.isArray(saved.jobs) ? saved.jobs : [];
        setJobs(
          rawJobs.map((j: Partial<Job>) => ({
            ...j,
            vehicleType: j.vehicleType ?? "Bike",
          })) as Job[],
        );
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
