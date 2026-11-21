"use client";

import React from "react";
import { Banner as AxBanner } from "@astryxdesign/core/Banner";
import { Icon as AxIcon, type IconType } from "@astryxdesign/core/Icon";

// Adaptador (rediseño con Astryx): misma API de siempre, dibujado por el
// Banner de Astryx. Sin `title`, el contenido pasa a ser el título (en Astryx
// el título es obligatorio); con `title`, el contenido va como descripción.

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const AX_STATUS = {
  success: "success",
  warning: "warning",
  danger: "error",
  info: "info",
  neutral: "info",
} as const;

interface BannerProps {
  tone?: Tone;
  title?: string;
  icon?: React.ElementType;
  onClose?: () => void;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function Banner({ tone = "neutral", title, icon, onClose, action, className, children }: BannerProps) {
  return (
    <AxBanner
      status={AX_STATUS[tone]}
      title={title ?? children}
      description={title ? children : undefined}
      icon={icon ? <AxIcon icon={icon as IconType} /> : undefined}
      isDismissable={!!onClose}
      onDismiss={onClose}
      dismissLabel="Cerrar aviso"
      endContent={action}
      className={className}
    />
  );
}
