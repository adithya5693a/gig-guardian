import { useI18n } from "@/lib/i18n";
import type { OfferVerdict } from "@/lib/jobs-store";

export function OfferVerdictCard({ verdict }: { verdict: OfferVerdict }) {
  const { translate } = useI18n();
  return (
    <div>
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
    </div>
  );
}
