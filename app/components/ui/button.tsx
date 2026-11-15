"use client";

import React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "link" | "link-danger";
// `icon`: botón cuadrado de solo icono (32 px); exige `aria-label`.
type Size = "sm" | "md" | "lg" | "icon";

const VARIANT: Record<Variant, string> = {
  // Un solo primario teal por vista (dirección congelada, nov 2026).
  primary:   "bg-accent text-on-accent font-medium hover:bg-accent-hover disabled:opacity-60",
  secondary: "border border-border text-foreground bg-surface hover:border-border-strong disabled:opacity-60",
  ghost:     "text-muted hover:bg-surface-light hover:text-foreground disabled:opacity-60",
  danger:    "bg-danger-bg text-danger border border-danger-border hover:bg-danger/20 disabled:opacity-60",
  link:      "text-accent-ink hover:underline underline-offset-4 p-0 h-auto disabled:opacity-60",
  "link-danger": "text-danger hover:underline underline-offset-4 p-0 h-auto disabled:opacity-60",
};

const isLink = (variant: Variant) => variant === "link" || variant === "link-danger";

// Los enlaces no tienen caja: el tamaño solo cambia la letra. El área táctil
// crece con un pseudo-elemento (≥ 32 px de alto) sin mover el diseño.
const LINK_HIT = "relative after:absolute after:-inset-x-1.5 after:-inset-y-2 after:content-['']";
const LINK_SIZE: Record<Size, string> = { sm: "text-xs font-medium gap-1", md: "text-sm gap-1.5", lg: "text-sm gap-1.5", icon: "" };

// Alturas 28 / 32 / 40, radio 6 (rounded-sm).
const SIZE: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs gap-1.5",
  md: "h-8 px-3 text-sm font-medium gap-1.5",
  lg: "h-10 px-4 text-sm font-medium gap-2",
  icon: "h-8 w-8 p-0 shrink-0",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ElementType;
  iconRight?: React.ElementType;
  fullWidth?: boolean;
  href?: string;
  external?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      icon: Icon,
      iconRight: IconRight,
      fullWidth = false,
      href,
      external = false,
      className,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const base = cn(
      "inline-flex items-center justify-center cursor-pointer select-none whitespace-nowrap",
      "transition-[background-color,color,border-color] duration-fast ease-brand motion-reduce:transition-none",
      "focus-visible:outline-2 focus-visible:outline-accent-strong focus-visible:outline-offset-2",
      // Andén: controles precisos y discretos, sin saltos al pasar el cursor.
      isLink(variant) ? cn(LINK_HIT, LINK_SIZE[size]) : cn("rounded-sm", SIZE[size]),
      VARIANT[variant],
      fullWidth && "w-full",
      (disabled || loading) && "pointer-events-none",
      className
    );

    const content = (
      <>
        {loading
          ? <Loader2 size={16} className="animate-spin shrink-0" />
          : Icon && <Icon size={16} className="shrink-0" />}
        {children}
        {!loading && IconRight && <IconRight size={16} className="shrink-0" />}
      </>
    );

    if (href && !disabled && !loading) {
      const {
        type: _type,
        form: _form,
        disabled: _disabled,
        loading: _loading,
        icon: _icon,
        iconRight: _iconRight,
        fullWidth: _fullWidth,
        href: _href,
        external: _external,
        variant: _variant,
        size: _size,
        ...linkProps
      } = props as Record<string, unknown>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const safe = linkProps as any;
      if (external) {
        return (
          <a href={href as string} className={base} target="_blank" rel="noopener noreferrer" {...safe}>
            {content}
          </a>
        );
      }
      return (
        <Link href={href as string} className={base} {...safe}>
          {content}
        </Link>
      );
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={base}
        {...props}
      >
        {content}
      </button>
    );
  }
);

Button.displayName = "Button";
