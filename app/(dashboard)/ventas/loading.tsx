import { PIPELINE_STAGES, STAGE_COLOR_BORDER, STAGE_COLOR_BG } from "@/lib/pipeline/stages";
import { cn } from "@/app/components/ui/cn";

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm animate-pulse">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-bubble bg-surface-light" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-28 rounded bg-surface-light" />
          <div className="h-3 w-20 rounded bg-surface-light" />
          <div className="flex gap-1">
            <div className="h-4 w-12 rounded-full bg-surface-light" />
            <div className="h-4 w-16 rounded-full bg-surface-light" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VentasLoading() {
  return (
    <div className="space-y-6">
      <div className="animate-pulse space-y-2">
        <div className="h-8 w-36 rounded bg-surface-light" />
        <div className="h-4 w-56 rounded bg-surface-light" />
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-5 shadow-sm animate-pulse space-y-2">
            <div className="h-3 w-16 rounded bg-surface-light" />
            <div className="h-7 w-12 rounded bg-surface-light" />
            <div className="h-3 w-20 rounded bg-surface-light" />
          </div>
        ))}
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map((stage) => (
          <div key={stage} className="flex min-w-[300px] max-w-[360px] flex-1 flex-col">
            <div className="mb-3 flex items-center gap-2 px-1">
              <div className="h-2.5 w-2.5 rounded-full bg-surface-light" />
              <div className="h-4 w-20 rounded bg-surface-light animate-pulse" />
            </div>
            <div className={cn("flex flex-1 flex-col gap-3 rounded-xl border p-3 min-h-[200px]", STAGE_COLOR_BORDER[stage], STAGE_COLOR_BG[stage])}>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
