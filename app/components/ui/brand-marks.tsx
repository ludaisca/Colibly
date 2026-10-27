import type { ReactNode } from "react";

// Marcas de lo que Colibly sí conecta o cobra (simple-icons, CC0), con el
// color de cada una. El palomitas azul es el de un mensaje leído en WhatsApp.

type IconProps = { size?: number | string; className?: string; mono?: boolean };

function Glyph({ size = 24, className, children, viewBox = "0 0 24 24" }: IconProps & { children: ReactNode; viewBox?: string }) {
  return (
    <svg viewBox={viewBox} width={size} height={size} className={className} aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export function GoogleSheetsIcon({ size, className, mono = false }: IconProps) {
  return (
    <Glyph size={size} className={className}>
      <path fill={mono ? "currentColor" : "#34A853"} d="M11.318 12.545H7.91v-1.909h3.41v1.91zM14.728 0v6h6l-6-6zm1.363 10.636h-3.41v1.91h3.41v-1.91zm0 3.273h-3.41v1.91h3.41v-1.91zM20.727 6.5v15.864c0 .904-.732 1.636-1.636 1.636H4.909a1.636 1.636 0 0 1-1.636-1.636V1.636C3.273.732 4.005 0 4.909 0h9.318v6.5h6.5zm-3.273 2.773H6.545v7.909h10.91v-7.91zm-6.136 4.636H7.91v1.91h3.41v-1.91z" />
    </Glyph>
  );
}

export function GoogleSheetsButtonIcon(props: Omit<IconProps, "mono">) {
  return <GoogleSheetsIcon {...props} mono />;
}

export function MetaIcon({ size, className }: IconProps) {
  return (
    <Glyph size={size} className={className}>
      <path fill="#0081FB" d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z" />
    </Glyph>
  );
}

export function StripeIcon({ size, className, mono = false }: IconProps) {
  return (
    <Glyph size={size} className={className}>
      <path fill={mono ? "currentColor" : "#635BFF"} d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z" />
    </Glyph>
  );
}

export function StripeButtonIcon(props: Omit<IconProps, "mono">) {
  return <StripeIcon {...props} mono />;
}

export function WhatsAppReadTicks({ size = 14, className }: IconProps) {
  const width = typeof size === "number" ? size : 14;
  return (
    <svg viewBox="0 0 18 13" width={width} height={Math.round(width * 13 / 18)} className={className} aria-hidden="true" focusable="false">
      <path fill="none" stroke="#53bdeb" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" d="M1.2 6.4 4.4 9.6 10.2 2.6" />
      <path fill="none" stroke="#53bdeb" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" d="M6.4 6.4 9.6 9.6 15.4 2.6" />
    </svg>
  );
}
