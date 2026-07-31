import { isFair, type Job } from "@/lib/jobs-store";

export function FairnessBadge({ job }: { job: Job }) {
  const fair = isFair(job);
  return (
    <span
      className={
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold " +
        (fair
          ? "bg-success/15 text-success"
          : "bg-destructive/15 text-destructive")
      }
    >
      {fair ? "✅ Fair" : "⚠️ Possible Underpayment"}
    </span>
  );
}
