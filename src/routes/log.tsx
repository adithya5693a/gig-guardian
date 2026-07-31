import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  benchmarkForVehicle,
  fairness,
  isRideHailingPlatform,
  type Platform,
  type VehicleType,
  useJobs,
  VEHICLE_BENCHMARKS,
} from "@/lib/jobs-store";
import { extractOcr, parseOcrText, type OcrValues } from "@/lib/ocr";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/log")({
  head: () => ({ meta: [{ title: "Log a Job — GigShield" }] }),
  component: LogJob,
});

const PLATFORMS: Platform[] = ["Zomato", "Swiggy", "Uber", "Ola", "Rapido", "Other"];
const VEHICLE_TYPES: VehicleType[] = ["Bike", "Auto", "Car (Non-AC)", "Car (AC/Premium)"];
const inputClass =
  "mt-1 w-full rounded-xl border border-input bg-secondary px-3 py-2.5 text-base outline-none focus:border-ring focus:ring-2 focus:ring-ring/30";

function localNow() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function applyOcrValues(
  values: OcrValues,
  setValue: (field: string, value: string) => void,
  setVehicle?: (v: VehicleType) => void,
) {
  // Only apply values OCR actually found; missing information stays available for manual entry.
  if (values.fare && values.fare > 0) setValue("fare", String(values.fare));
  if (values.distance && values.distance > 0) setValue("distance", String(values.distance));
  if (values.minutes && values.minutes > 0) setValue("minutes", String(values.minutes));
  if (values.platform) setValue("platform", values.platform);
  if (values.vehicleType && setVehicle) setVehicle(values.vehicleType);
  if (values.datetime) setValue("datetime", values.datetime);
  if (values.area) setValue("area", values.area);
}

function LogJob() {
  const { jobs, jobsToLog, addJob, setupComplete } = useJobs();
  const { translate } = useI18n();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"manual" | "scan">("manual");
  const [platform, setPlatform] = useState<Platform>("Zomato");
  const [vehicleType, setVehicleType] = useState<VehicleType>("Bike");
  const [fare, setFare] = useState("");
  const [distance, setDistance] = useState("");
  const [minutes, setMinutes] = useState("");
  const [datetime, setDatetime] = useState(localNow());
  const [area, setArea] = useState("");
  const [ocrText, setOcrText] = useState("");
  const [lastOcr, setLastOcr] = useState<OcrValues | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const showVehicleSelect = isRideHailingPlatform(platform);
  const activeVehicle: VehicleType = showVehicleSelect ? vehicleType : "Bike";

  function handlePlatformChange(nextPlatform: Platform) {
    setPlatform(nextPlatform);
    if (!isRideHailingPlatform(nextPlatform)) {
      setVehicleType("Bike");
    }
  }

  function handleOcrResults(values: OcrValues) {
    setLastOcr(values);
    applyOcrValues(
      values,
      (field, value) => {
        if (field === "fare") setFare(value);
        if (field === "distance") setDistance(value);
        if (field === "minutes") setMinutes(value);
        if (field === "platform") handlePlatformChange(value as Platform);
        if (field === "datetime") setDatetime(value);
        if (field === "area") setArea(value);
      },
      (vehicle) => setVehicleType(vehicle),
    );
  }

  async function scanScreenshot(file: File) {
    setOcrBusy(true);
    setError("");
    try {
      const result = await extractOcr(file);
      setOcrText(result.text);
      handleOcrResults(result.values);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "OCR could not read this image. Paste the text manually.",
      );
    } finally {
      setOcrBusy(false);
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const f = Number(fare),
      d = Number(distance),
      m = Number(minutes);
    if (!(f > 0) || !(d > 0) || !(m > 0) || !datetime) {
      setError("Enter a payout, distance, time, and date greater than zero.");
      return;
    }
    const started = new Date(datetime);
    const nightShift = started.getHours() >= 19 || started.getHours() < 6;
    const job = {
      platform,
      vehicleType: activeVehicle,
      fare: f,
      distance: d,
      minutes: m,
      datetime,
      area: area || "Unknown",
      nightShift,
      source: mode,
    } as const;
    addJob(job);
    const result = fairness(job);
    setMessage(
      `${result.status}: actual ₹${f.toFixed(0)} vs estimated fair ₹${result.expected.toFixed(0)} (${activeVehicle} benchmark: ₹${result.benchmark}/km).`,
    );
    setFare("");
    setDistance("");
    setMinutes("");
    setOcrText("");
  }

  if (!setupComplete)
    return (
      <AppShell>
        <div className="rounded-3xl border border-border bg-card p-6">
          <h1 className="text-2xl font-extrabold">{translate("Set up your work plan first")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {translate(
              "Go back to the dashboard and tell GigShield how many jobs you want to record.",
            )}
          </p>
          <Link
            to="/"
            className="mt-4 inline-block rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground"
          >
            {translate("Go to setup")}
          </Link>
        </div>
      </AppShell>
    );

  return (
    <AppShell>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{translate("Log a job")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Job {Math.min(jobs.length + 1, jobsToLog)} of {jobsToLog} · enter details or scan a
            {translate("enter details or scan a screenshot.")}
          </p>
        </div>
        <Link to="/" className="text-sm font-bold text-muted-foreground hover:text-foreground">
          {translate("Dashboard")}
        </Link>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-success transition-all"
          style={{ width: `${Math.min(100, (jobs.length / jobsToLog) * 100)}%` }}
        />
      </div>
      <div className="mt-5 inline-flex rounded-xl border border-border bg-card p-1">
        <button
          onClick={() => setMode("manual")}
          className={`rounded-lg px-4 py-2 text-sm font-bold ${mode === "manual" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          {translate("Enter manually")}
        </button>
        <button
          onClick={() => setMode("scan")}
          className={`rounded-lg px-4 py-2 text-sm font-bold ${mode === "scan" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          {translate("Scan screenshot")}
        </button>
      </div>
      {mode === "scan" ? (
        <div className="mt-4 rounded-3xl border border-border bg-card p-4">
          <label className="text-sm font-bold">{translate("Upload app screenshot")}</label>
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void scanScreenshot(file);
            }}
            className="mt-2 block w-full text-sm"
          />
          {lastOcr ? (
            <div className="mt-3 rounded-2xl bg-secondary/80 p-3 text-xs leading-relaxed">
              <div className="font-bold text-foreground">{translate("Extracted OCR Details:")}</div>
              <div className="mt-1.5 flex flex-wrap gap-2 text-muted-foreground">
                {lastOcr.pickupDistance !== undefined ? (
                  <span className="rounded-md bg-background px-2 py-1 font-semibold text-foreground">
                    Pickup: {lastOcr.pickupDistance} km
                  </span>
                ) : null}
                {lastOcr.distance !== undefined ? (
                  <span className="rounded-md bg-background px-2 py-1 font-semibold text-foreground">
                    Trip: {lastOcr.distance} km
                  </span>
                ) : null}
                {lastOcr.fare !== undefined ? (
                  <span className="rounded-md bg-background px-2 py-1 font-semibold text-foreground">
                    Payout: ₹{lastOcr.fare} {lastOcr.paymentMode ? `(${lastOcr.paymentMode})` : ""}
                  </span>
                ) : null}
                {lastOcr.vehicleType ? (
                  <span className="rounded-md bg-background px-2 py-1 font-semibold text-foreground">
                    Vehicle: {lastOcr.vehicleType}
                  </span>
                ) : null}
                {lastOcr.area ? (
                  <span className="rounded-md bg-background px-2 py-1 font-semibold text-foreground">
                    Destination: {lastOcr.area}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
          <label className="mt-4 block text-sm font-bold">
            {translate("OCR text correction (optional)")}
            <textarea
              value={ocrText}
              onChange={(e) => {
                setOcrText(e.target.value);
                const values = parseOcrText(e.target.value);
                handleOcrResults(values);
              }}
              placeholder="Paste text such as Bike · ₹29 (Cash) · 0.3 Km · 2.3 Km drop Brookefield"
              className={`${inputClass} min-h-24`}
            />
          </label>
        </div>
      ) : null}
      <form
        onSubmit={save}
        className="mt-4 space-y-4 rounded-3xl border border-border bg-card p-4 sm:p-6"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">{translate("Platform")}</span>
            <select
              value={platform}
              onChange={(e) => handlePlatformChange(e.target.value as Platform)}
              className={inputClass}
            >
              {PLATFORMS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>

          {showVehicleSelect ? (
            <label className="block">
              <span className="text-sm font-medium">{translate("Vehicle Type")}</span>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                className={inputClass}
              >
                {VEHICLE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type} (₹{VEHICLE_BENCHMARKS[type].benchmark}/km)
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="block">
            <span className="text-sm font-medium">{translate("Payout (₹)")}</span>
            <input
              value={fare}
              onChange={(e) => setFare(e.target.value)}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="180"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">{translate("Distance (km)")}</span>
            <input
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              type="number"
              min="0"
              step="0.1"
              placeholder="12"
              className={inputClass}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium">{translate("Time (minutes)")}</span>
            <input
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              type="number"
              min="0"
              placeholder="35"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">{translate("Area or zone")}</span>
            <input
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="Koramangala"
              className={inputClass}
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">{translate("Date & time")}</span>
            <input
              value={datetime}
              onChange={(e) => setDatetime(e.target.value)}
              type="datetime-local"
              className={inputClass}
            />
          </label>
        </div>

        {fare && distance && minutes ? (
          <div className="rounded-2xl bg-secondary p-3 text-sm">
            {translate("Estimated fair payout:")}{" "}
            <b>
              ₹
              {fairness({
                fare: Number(fare),
                distance: Number(distance),
                vehicleType: activeVehicle,
              }).expected.toFixed(0)}
            </b>
            <span className="ml-2 text-muted-foreground">
              (Benchmark: ₹{VEHICLE_BENCHMARKS[activeVehicle].benchmark}/km · {activeVehicle})
            </span>
          </div>
        ) : null}
        {message ? (
          <p className="rounded-xl bg-success/15 p-3 text-sm font-bold text-success">{message}</p>
        ) : null}
        {error ? <p className="text-sm font-bold text-destructive">{error}</p> : null}
        <button className="w-full rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground hover:opacity-90">
          {translate("Save and check fairness")}
        </button>
      </form>
    </AppShell>
  );
}
