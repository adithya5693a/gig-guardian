import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  isRideHailingPlatform,
  offerVerdict,
  type Platform,
  type VehicleType,
  useJobs,
  VEHICLE_BENCHMARKS,
} from "@/lib/jobs-store";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/check")({
  head: () => ({ meta: [{ title: "Check an Offer — GigShield" }] }),
  component: CheckOffer,
});

const PLATFORMS: Platform[] = ["Zomato", "Swiggy", "Uber", "Ola", "Rapido", "Other"];
const VEHICLE_TYPES: VehicleType[] = ["Bike", "Auto", "Car (Non-AC)", "Car (AC/Premium)"];
const inputClass =
  "mt-1 w-full rounded-xl border border-input bg-secondary px-3 py-2.5 text-base outline-none focus:border-ring focus:ring-2 focus:ring-ring/30";

function CheckOffer() {
  const { jobs, setupComplete } = useJobs();
  const { translate } = useI18n();
  const [platform, setPlatform] = useState<Platform>("Zomato");
  const [vehicleType, setVehicleType] = useState<VehicleType>("Bike");
  const [distance, setDistance] = useState("");
  const [offered, setOffered] = useState("");

  const showVehicleSelect = isRideHailingPlatform(platform);
  const activeVehicle: VehicleType = showVehicleSelect ? vehicleType : "Bike";

  function handlePlatformChange(nextPlatform: Platform) {
    setPlatform(nextPlatform);
    if (!isRideHailingPlatform(nextPlatform)) {
      setVehicleType("Bike");
    }
  }

  const d = Number(distance);
  const o = Number(offered);
  const canCheck = d > 0 && o > 0;
  const verdict = canCheck
    ? offerVerdict({ fare: o, distance: d, vehicleType: activeVehicle, platform }, jobs)
    : null;

  return (
    <AppShell>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{translate("Check an offer")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {translate("Before accepting, work out whether the pay is fair.")}
          </p>
        </div>
        <Link to="/" className="text-sm font-bold text-muted-foreground hover:text-foreground">
          {translate("Dashboard")}
        </Link>
      </div>

      <form
        onSubmit={(e) => e.preventDefault()}
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
          ) : (
            <div className="hidden sm:block" />
          )}

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

          <label className="block">
            <span className="text-sm font-medium">{translate("Offered payout (₹)")}</span>
            <input
              value={offered}
              onChange={(e) => setOffered(e.target.value)}
              type="number"
              min="0"
              step="0.01"
              placeholder="150"
              className={inputClass}
            />
          </label>
        </div>
      </form>

      {setupComplete && jobs.length >= 3 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {translate("Benchmark from your logged payouts")}
        </p>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          {translate("Vehicle benchmark used until you log 3+ jobs.")}
        </p>
      )}

      {verdict ? (
        <section className="mt-4 rounded-3xl border border-border bg-card p-5">
          {verdict.level === "accept" ? (
            <div className="rounded-2xl bg-success/15 p-4 text-success">
              <p className="text-lg font-extrabold">{translate("ACCEPT")}</p>
              <p className="mt-1 text-sm">
                {translate(
                  "This offer is at or above the fair payout. If the trip details match, take it.",
                )}
              </p>
            </div>
          ) : null}
          {verdict.level === "consider" ? (
            <div className="rounded-2xl bg-amber-500/15 p-4 text-amber-700">
              <p className="text-lg font-extrabold">{translate("BORDERLINE")}</p>
              <p className="mt-1 text-sm">
                {translate(
                  "The offer is within 10% of fair pay. Accept only during slow hours or if exactly right.",
                )}
              </p>
            </div>
          ) : null}
          {verdict.level === "reject" ? (
            <div className="rounded-2xl bg-destructive/15 p-4 text-destructive">
              <p className="text-lg font-extrabold">{translate("REJECT")}</p>
              <p className="mt-1 text-sm">
                {translate(
                  "This pays more than 10% below your fair rate. Decline it or counter with the suggested amount.",
                )}
              </p>
            </div>
          ) : null}

          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-secondary p-3">
              <dt className="text-muted-foreground">{translate("Offered")}</dt>
              <dd className="mt-1 text-lg font-extrabold">₹{verdict.offered.toFixed(0)}</dd>
            </div>
            <div className="rounded-xl bg-secondary p-3">
              <dt className="text-muted-foreground">{translate("Fair payout")}</dt>
              <dd className="mt-1 text-lg font-extrabold">₹{verdict.expected.toFixed(0)}</dd>
            </div>
            <div className="rounded-xl bg-secondary p-3">
              <dt className="text-muted-foreground">{translate("Your rate")}</dt>
              <dd className="mt-1 text-lg font-extrabold">₹{verdict.ratePerKm.toFixed(1)}/km</dd>
            </div>
            <div className="rounded-xl bg-secondary p-3">
              <dt className="text-muted-foreground">{translate("Benchmark")}</dt>
              <dd className="mt-1 text-lg font-extrabold">₹{verdict.benchmark.toFixed(1)}/km</dd>
            </div>
          </dl>

          <div className="mt-4 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm">
            <p className="font-bold">{translate("Rule of 10 suggestion")}</p>
            <p className="mt-1 text-muted-foreground">
              {translate("Minimum, counter with at least")} ₹{verdict.ruleOfTenFloor.toFixed(0)}{" "}
              {translate("for this trip.")}
            </p>
          </div>
        </section>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          {translate("Enter a distance and offered payout to see the verdict.")}
        </p>
      )}
    </AppShell>
  );
}
