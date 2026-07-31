import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type Job = {
  id: string;
  platform: string;
  fare: number;
  distance: number;
  minutes: number;
  datetime: string;
};

export const BENCHMARK_PER_KM = 15;
export const FAIR_THRESHOLD = BENCHMARK_PER_KM * 0.8;

export function ratePerKm(job: Job) {
  return job.distance > 0 ? job.fare / job.distance : 0;
}

export function isFair(job: Job) {
  return ratePerKm(job) >= FAIR_THRESHOLD;
}

type JobsContextValue = {
  jobs: Job[];
  addJob: (job: Omit<Job, "id">) => void;
  removeJob: (id: string) => void;
};

const JobsContext = createContext<JobsContextValue | null>(null);

export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);

  const value = useMemo<JobsContextValue>(
    () => ({
      jobs,
      addJob: (job) =>
        setJobs((prev) =>
          [{ ...job, id: crypto.randomUUID() }, ...prev].sort(
            (a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime(),
          ),
        ),
      removeJob: (id) => setJobs((prev) => prev.filter((j) => j.id !== id)),
    }),
    [jobs],
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
  const day = (date.getDay() + 6) % 7; // Monday start
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day);
  return date;
}

export function jobsThisWeek(jobs: Job[]) {
  const start = startOfWeek();
  return jobs.filter((j) => new Date(j.datetime) >= start);
}
