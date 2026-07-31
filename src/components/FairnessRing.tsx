export function FairnessRing({ fair, flagged }: { fair: number; flagged: number }) {
  const total = fair + flagged;
  const pct = total === 0 ? 0 : Math.round((fair / total) * 100);
  const r = 34;
  const c = 2 * Math.PI * r;

  return (
    <div className="animate-rise flex items-center gap-4 rounded-3xl border border-border bg-card p-4">
      <div className="relative h-24 w-24 shrink-0">
        <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" strokeWidth="8" className="stroke-secondary" />
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            className="stroke-success transition-[stroke-dashoffset] duration-700 ease-out"
            strokeDasharray={c}
            strokeDashoffset={c - (c * pct) / 100}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="text-lg font-extrabold tabular-nums">{pct}%</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold">Fair pay ratio</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {fair} fair · {flagged} underpaid
        </p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-success transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
