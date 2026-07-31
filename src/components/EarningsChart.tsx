export type ChartPoint = { label: string; value: number };

export function EarningsChart({ data }: { data: ChartPoint[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="animate-rise rounded-3xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-bold tracking-tight">Earnings breakdown</h2>
        <span className="text-xs text-muted-foreground">peak ₹{max.toFixed(0)}</span>
      </div>
      <div className="mt-4 flex h-40 items-end gap-1.5">
        {data.map((d, i) => (
          <div
            key={d.label + i}
            className="group flex min-w-0 flex-1 h-full flex-col justify-end items-center gap-1.5"
          >
            <span className="text-[10px] font-semibold tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
              ₹{d.value.toFixed(0)}
            </span>
            <div className="flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t-lg bg-gradient-teal transition-all duration-500 ease-out hover:opacity-90 hover:shadow-glow-teal"
                style={{
                  height: `${Math.max(d.value > 0 ? 6 : 2, (d.value / max) * 100)}%`,
                  transitionDelay: `${i * 30}ms`,
                }}
              />
            </div>
            <span className="w-full truncate text-center text-[10px] text-muted-foreground">
              {d.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
