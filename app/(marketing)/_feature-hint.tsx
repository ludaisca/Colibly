"use client";

import { useId, useState } from "react";
import { cn } from "@/app/components/ui/cn";

/** Texto con tip opcional (hover/focus). Para features densas en /precios. */
export function FeatureHint({
  text,
  hint,
  muted,
}: {
  text: string;
  hint?: string;
  muted?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  if (!hint) {
    return <span className={cn(muted && "text-muted")}>{text}</span>;
  }

  return (
    <span className={cn("relative inline", muted && "text-muted")}>
      <button
        type="button"
        className="border-b border-dotted border-accent-ink/50 text-left hover:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {text}
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="absolute left-0 top-[calc(100%+0.4rem)] z-20 w-[min(16rem,calc(100vw-2rem))] max-w-[min(16rem,70vw)] rounded-lg border border-border bg-surface px-2.5 py-2 text-pretty text-xs font-normal leading-relaxed text-muted shadow-lg sm:max-w-none"
        >
          {hint}
        </span>
      ) : null}
    </span>
  );
}
