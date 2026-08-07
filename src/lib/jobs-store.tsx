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

export type SavingEntry = { id: string; amount: number; date: string };

export const VEHICLE_BENCHMARKS: Record<VehicleType, { benchmark: number; flagThreshold: number }> =
  {
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

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Real payout records (the worker's logged jobs) drive the community benchmark.
// The vehicle baseline is used only when there are not enough real samples.
export function communityBenchmarkFor(
  job: { platform?: Platform; vehicleType?: VehicleType },
  observations: Job[] = [],
) {
  const vehicleType = getVehicleType(job);
  const matching = observations.filter(
    (item) =>
      item.vehicleType === vehicleType &&
      item.distance > 0 &&
      item.fare > 0 &&
      (!job.platform || item.platform === job.platform),
  );
  const rates = matching.map((item) => item.fare / item.distance);
  const medianRate = median(rates);
  const fallback = benchmarkForVehicle(vehicleType).benchmark;
  return {
    benchmark: Math.round((medianRate || fallback) * 100) / 100,
    sampleSize: matching.length,
    source: matching.length >= 3 ? ("community" as const) : ("vehicle" as const),
  };
}

export function ratePerKm(job: Pick<Job, "fare" | "distance">) {
  return job.distance > 0 ? job.fare / job.distance : 0;
}

export function fairness(
  job: Pick<Job, "fare" | "distance"> & { vehicleType?: VehicleType; platform?: Platform },
  observations: Job[] = [],
) {
  const vehicleType = getVehicleType(job);
  const vehicleBenchmark = benchmarkForVehicle(getVehicleType(job));
  const community = communityBenchmarkFor(job, observations);
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

// "Rule of 10": an offer is worth accepting only if it is within 10% of the
// estimated fair payout for the trip. Anything below that threshold should be
// rejected or countered with at least the fair estimate.
export function offerVerdict(
  offer: Pick<Job, "fare" | "distance"> & { vehicleType?: VehicleType; platform?: Platform },
  observations: Job[] = [],
) {
  const fair = fairness(offer, observations);
  const offered = Number(offer.fare) || 0;
  const threshold = Math.round(fair.expected * 0.9 * 100) / 100;
  const level =
    offered <= 0 || fair.expected <= 0
      ? ("pending" as const)
      : offered >= fair.expected
        ? ("accept" as const)
        : offered >= threshold
          ? ("consider" as const)
          : ("reject" as const);
  return {
    level,
    offered,
    expected: fair.expected,
    ruleOfTenFloor: threshold,
    benchmark: fair.benchmark,
    ratePerKm: fair.ratePerKm,
    benchmarkSource: fair.benchmarkSource,
    communitySampleSize: fair.communitySampleSize,
  };
}

type JobsContextValue = {
  jobs: Job[];
  jobsToLog: number;
  setupComplete: boolean;
  savingsGoal: number;
  dailySavingTarget: number;
  autoSavePercent: number;
  savingsLog: SavingEntry[];
  trustedNumber: string;
  geminiApiKey: string;
  geminiModel: string;
  openRouterApiKey: string;
  addJob: (job: Omit<Job, "id">) => void;
  removeJob: (id: string) => void;
  completeSetup: (jobsToLog: number) => void;
  resetSetup: () => void;
  setSavingsGoal: (goal: number) => void;
  setDailySavingTarget: (target: number) => void;
  setAutoSavePercent: (percent: number) => void;
  addSavingEntry: (amount: number, date: string) => void;
  removeSavingEntry: (id: string) => void;
  setTrustedNumber: (number: string) => void;
  setGeminiApiKey: (key: string) => void;
  setGeminiModel: (model: string) => void;
  setOpenRouterApiKey: (key: string) => void;
};

const JobsContext = createContext<JobsContextValue | null>(null);

const storageKey = "gigshield-state-v2";

function envExampleValue(name: string) {
  const line = envExample.split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  const value = line?.slice(name.length + 1).trim() ?? "";
  return value.endsWith("_api_key_here") ? "" : value;
}

const configuredGeminiApiKey =
  import.meta.env.VITE_GEMINI_API_KEY || envExampleValue("VITE_GEMINI_API_KEY");
const configuredGeminiModel =
  import.meta.env.VITE_GEMINI_MODEL || envExampleValue("VITE_GEMINI_MODEL") || "gemini-2.0-flash";
const configuredOpenRouterApiKey =
  import.meta.env.VITE_OPENROUTER_API_KEY || envExampleValue("VITE_OPENROUTER_API_KEY");

const getApiKey = () => {
  if (typeof process !== "undefined" && process.env?.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  return configuredGeminiApiKey;
};

const getOpenRouterKey = () => {
  if (typeof process !== "undefined" && process.env?.OPENROUTER_API_KEY) {
    return process.env.OPENROUTER_API_KEY;
  }
  return configuredOpenRouterApiKey;
};

export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsToLog, setJobsToLog] = useState(1);
  const [setupComplete, setSetupComplete] = useState(false);
  const [savingsGoal, setSavingsGoal] = useState(5000);
  const [dailySavingTarget, setDailySavingTarget] = useState(300);
  const [autoSavePercent, setAutoSavePercent] = useState(10);
  const [savingsLog, setSavingsLog] = useState<SavingEntry[]>([]);
  const [trustedNumber, setTrustedNumber] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState(() => getApiKey());
  const [geminiModel, setGeminiModel] = useState(configuredGeminiModel);
  const [openRouterApiKey, setOpenRouterApiKey] = useState(() => getOpenRouterKey());
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
        setDailySavingTarget(saved.dailySavingTarget ?? 300);
        setAutoSavePercent(saved.autoSavePercent ?? 10);
        setSavingsLog(Array.isArray(saved.savingsLog) ? saved.savingsLog : []);
        setTrustedNumber(saved.trustedNumber ?? "");
        setGeminiApiKey(saved.geminiApiKey ?? getApiKey());
        setGeminiModel(saved.geminiModel ?? "gemini-2.0-flash");
        setOpenRouterApiKey(saved.openRouterApiKey ?? getOpenRouterKey());
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
      JSON.stringify({
        jobs,
        jobsToLog,
        setupComplete,
        savingsGoal,
        dailySavingTarget,
        autoSavePercent,
        savingsLog,
        trustedNumber,
        geminiApiKey,
        geminiModel,
        openRouterApiKey,
      }),
    );
  }, [
    hydrated,
    jobs,
    jobsToLog,
    setupComplete,
    savingsGoal,
    dailySavingTarget,
    autoSavePercent,
    savingsLog,
    trustedNumber,
    geminiApiKey,
    geminiModel,
    openRouterApiKey,
  ]);

  const value = useMemo<JobsContextValue>(
    () => ({
      jobs,
      jobsToLog,
      setupComplete,
      savingsGoal,
      dailySavingTarget,
      autoSavePercent,
      savingsLog,
      trustedNumber,
      geminiApiKey,
      geminiModel,
      openRouterApiKey,
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
      setDailySavingTarget,
      setAutoSavePercent,
      addSavingEntry: (amount, date) =>
        setSavingsLog((prev) => [{ id: crypto.randomUUID(), amount, date }, ...prev]),
      removeSavingEntry: (id) => setSavingsLog((prev) => prev.filter((entry) => entry.id !== id)),
      setTrustedNumber,
      setGeminiApiKey,
      setGeminiModel,
      setOpenRouterApiKey,
    }),
    [
      jobs,
      jobsToLog,
      setupComplete,
      savingsGoal,
      dailySavingTarget,
      autoSavePercent,
      savingsLog,
      trustedNumber,
      geminiApiKey,
      geminiModel,
      openRouterApiKey,
    ],
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
