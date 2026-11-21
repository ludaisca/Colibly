"use client";

import React from "react";
import { Button as AxButton } from "@astryxdesign/core/Button";
import { Link as AxLink } from "@astryxdesign/core/Link";
import { Icon as AxIcon, type IconType } from "@astryxdesign/core/Icon";
import { cn } from "./cn";
import { textOf } from "./text-of";

// Adaptador (rediseño con Astryx, 2026-11-21): misma API de siempre, dibujado
// por el Button/Link de Astryx. Las 131 pantallas que lo usan cambian de golpe
// sin tocarlas. Para código nuevo, usa @astryxdesign/core/Button directamente.

type Variant = "primary" | "secondary" | "ghost" | "danger" | "link" | "link-danger";
// `icon`: botón cuadrado de solo icono; exige `aria-label` (o `title`).
type Size = "sm" | "md" | "lg" | "icon";

const AX_VARIANT = {
  primary: "primary",
  secondary: "secondary",
  ghost: "ghost",
  danger: "destructive",
} as const;

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
      title,
      type = "button",
      // HTML que el Button de Astryx no tipa (el botón siempre lo resuelve él).
      autoFocus: _autoFocus,
      formAction: _formAction,
      ...rest
    },
    ref
  ) => {
    // Astryx exige un nombre accesible en texto; se toma del contenido.
    const label =
      (rest["aria-label"] as string | undefined) ?? textOf(children) ?? title ?? "";
    // Los íconos de lucide son componentes SVG: válidos como IconType.
    const icon = Icon ? <AxIcon icon={Icon as IconType} /> : undefined;
    const iconRight = IconRight ? <AxIcon icon={IconRight as IconType} /> : undefined;

    if (variant === "link" || variant === "link-danger") {
      return (
        <AxLink
          ref={ref as React.Ref<HTMLAnchorElement | HTMLButtonElement>}
          href={disabled || loading ? undefined : href}
          isExternalLink={external}
          isDisabled={disabled || loading}
          tooltip={title}
          type="inherit"
          size={size === "sm" ? "xsm" : undefined}
          color={variant === "link" ? "accent" : "inherit"}
          className={cn(variant === "link-danger" && "text-danger", className)}
          onClick={rest.onClick as React.MouseEventHandler | undefined}
        >
          {icon}
          {children}
          {iconRight}
        </AxLink>
      );
    }

    const isIconOnly = size === "icon";
    return (
      <AxButton
        ref={ref}
        {...(rest as Omit<typeof rest, "color">)}
        type={type as "button" | "submit" | "reset"}
        label={label}
        variant={AX_VARIANT[variant]}
        size={isIconOnly ? "md" : size}
        isIconOnly={isIconOnly}
        isLoading={loading}
        isDisabled={disabled}
        icon={icon}
        endContent={iconRight}
        width={fullWidth ? "100%" : undefined}
        tooltip={title}
        href={disabled || loading ? undefined : href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className={className}
      >
        {isIconOnly ? undefined : children}
      </AxButton>
    );
  }
);

Button.displayName = "Button";
