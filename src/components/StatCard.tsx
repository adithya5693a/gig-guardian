import type { LucideIcon } from "lucide-react";
import { useCountUp } from "@/lib/use-count-up";
import { cn } from "@/lib/utils";

type Tone = "violet" | "teal" | "amber";

const toneClass: Record<Tone, string> = {
  violet: "bg-gradient-violet shadow-glow-violet",
  teal: "bg-gradient-teal shadow-glow-teal",
  amber: "bg-gradient-amber shadow-glow-amber",
};

export function StatCard({
  label,
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  hint,
  icon: Icon,
  tone,
  delay = 0,
}: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  hint?: string;
  icon: LucideIcon;
  tone: Tone;
  delay?: number;
}) {
  const animated = useCountUp(value);

  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        "animate-rise group relative overflow-hidden rounded-3xl p-4 text-white",
        "transition-transform duration-300 will-change-transform hover:-translate-y-1",
        toneClass[tone],
      )}
    >
      <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/15 blur-2xl transition-opacity duration-300 group-hover:opacity-80" />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/80">{label}</p>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/20 backdrop-blur">
          <Icon size={16} />
        </span>
      </div>
      <p className="relative mt-2 text-2xl font-extrabold tracking-tight tabular-nums">
        {prefix}
        {animated.toLocaleString("en-IN", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })}
        {suffix}
      </p>
      {hint ? <p className="relative mt-1 text-xs text-white/75">{hint}</p> : null}
    </div>
  );
}
