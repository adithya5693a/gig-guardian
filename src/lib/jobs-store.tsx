import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import envExample from "../../.env.example?raw";

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

export const VEHICLE_BENCHMARKS: Record<VehicleType, { benchmark: number; flagThreshold: number }> =
  {
    Bike: { benchmark: 15, flagThreshold: 12 },
    Auto: { benchmark: 18, flagThreshold: 14 },
    "Car (Non-AC)": { benchmark: 22, flagThreshold: 17 },
    "Car (AC/Premium)": { benchmark: 28, flagThreshold: 22 },
  };

type CommunityObservation = {
  worker: string;
  platform: Platform;
  vehicleType: VehicleType;
  distance: number;
  fare: number;
};

const COMMUNITY_RATE_SEEDS: Record<Platform, Partial<Record<VehicleType, number>>> = {
  Zomato: { Bike: 14.2, Auto: 17.1 },
  Swiggy: { Bike: 14.8, Auto: 17.6 },
  Uber: { Bike: 15.4, Auto: 18.5, "Car (Non-AC)": 21.8, "Car (AC/Premium)": 27.5 },
  Ola: { Bike: 15.1, Auto: 18.2, "Car (Non-AC)": 22.3, "Car (AC/Premium)": 28.4 },
  Rapido: { Bike: 14.6, Auto: 17.8 },
  Other: { Bike: 14.5, Auto: 17.5, "Car (Non-AC)": 21.5, "Car (AC/Premium)": 27 },
};

// Deterministic demo observations stand in for anonymized crowdsourced records
// until a real backend/Supabase dataset is connected.
export const COMMUNITY_OBSERVATIONS: CommunityObservation[] = Object.entries(
  COMMUNITY_RATE_SEEDS,
).flatMap(([platform, vehicleRates], platformIndex) =>
  Object.entries(vehicleRates).flatMap(([vehicleType, rate], vehicleIndex) =>
    [3.5, 5, 7.5, 10, 12, 16].map((distance, workerIndex) => ({
      worker: `demo-worker-${platformIndex + 1}-${vehicleIndex + 1}-${workerIndex + 1}`,
      platform: platform as Platform,
      vehicleType: vehicleType as VehicleType,
      distance,
      fare: Math.round(distance * (rate + ((workerIndex % 3) - 1) * 0.7) * 100) / 100,
    })),
  ),
);

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

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function communityBenchmarkFor(job: { platform?: Platform; vehicleType?: VehicleType }) {
  const vehicleType = getVehicleType(job);
  const matching = COMMUNITY_OBSERVATIONS.filter(
    (observation) =>
      observation.vehicleType === vehicleType &&
      (!job.platform || observation.platform === job.platform),
  );
  const rates = matching.map((observation) => observation.fare / observation.distance);
  const medianRate = median(rates);
  const fallback = benchmarkForVehicle(vehicleType).benchmark;
  return {
    benchmark: Math.round((medianRate || fallback) * 100) / 100,
    sampleSize: matching.length,
    source: matching.length >= 5 ? ("community" as const) : ("vehicle" as const),
  };
}

export function ratePerKm(job: Pick<Job, "fare" | "distance">) {
  return job.distance > 0 ? job.fare / job.distance : 0;
}

export function fairness(
  job: Pick<Job, "fare" | "distance"> & { vehicleType?: VehicleType; platform?: Platform },
) {
  const vehicleType = getVehicleType(job);
  const vehicleBenchmark = benchmarkForVehicle(vehicleType);
  const community = communityBenchmarkFor(job);
  const benchmark =
    community.source === "community"
      ? Math.round((vehicleBenchmark.benchmark * 0.35 + community.benchmark * 0.65) * 100) / 100
      : vehicleBenchmark.benchmark;
  const flagThreshold = Math.round(benchmark * 0.8 * 100) / 100;
  const expected = Math.round(job.distance * benchmark * 100) / 100;
  const rate = ratePerKm(job);
  const flagged = job.distance > 0 && rate < flagThreshold;

  return {
    expected,
    benchmark,
    flagThreshold,
    vehicleType,
    ratePerKm: rate,
    communityBenchmark: community.benchmark,
    communitySampleSize: community.sampleSize,
    benchmarkSource: community.source,
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

function envExampleValue(name: string) {
  const line = envExample.split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  const value = line?.slice(name.length + 1).trim() ?? "";
  return value === "your_gemini_api_key_here" ? "" : value;
}

const configuredGeminiApiKey =
  import.meta.env.VITE_GEMINI_API_KEY || envExampleValue("VITE_GEMINI_API_KEY");
const configuredGeminiModel =
  import.meta.env.VITE_GEMINI_MODEL || envExampleValue("VITE_GEMINI_MODEL") || "gemini-2.0-flash";

const getApiKey = () => {
  if (typeof process !== "undefined" && process.env?.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  return configuredGeminiApiKey;
};

export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsToLog, setJobsToLog] = useState(1);
  const [setupComplete, setSetupComplete] = useState(false);
  const [savingsGoal, setSavingsGoal] = useState(5000);
  const [geminiApiKey, setGeminiApiKey] = useState(() => getApiKey());
  const [geminiModel, setGeminiModel] = useState(configuredGeminiModel);
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

export function jobsLastWeek(jobs: Job[]) {
  const startOfThisWeek = startOfWeek();
  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
  return jobs.filter((job) => {
    const dt = new Date(job.datetime);
    return dt >= startOfLastWeek && dt < startOfThisWeek;
  });
}
