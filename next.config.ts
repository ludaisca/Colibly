import type { NextConfig } from "next";

// CSP global. Los terceros permitidos son los que carga el sitio público:
// medición con consentimiento (lib/analytics: Meta Pixel, GA4, Google Ads) y el
// captcha del registro (Cloudflare Turnstile). Sin estos orígenes el navegador
// bloqueaba los scripts y los beacons aunque los IDs estuvieran configurados.
// Los IDs se leen en runtime; los orígenes son fijos, por eso viven aquí.
const META = ["https://connect.facebook.net", "https://www.facebook.com"];
const GOOGLE_SCRIPT = ["https://*.googletagmanager.com", "https://www.googleadservices.com", "https://googleads.g.doubleclick.net"];
const GOOGLE_BEACON = [
  "https://*.google-analytics.com",
  "https://*.analytics.google.com",
  "https://*.googletagmanager.com",
  "https://*.g.doubleclick.net",
  "https://*.google.com",
  "https://www.google.com.mx",
  "https://www.googleadservices.com",
  "https://pagead2.googlesyndication.com",
];
const TURNSTILE = "https://challenges.cloudflare.com";
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${[...META, ...GOOGLE_SCRIPT, TURNSTILE].join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${[...META, ...GOOGLE_BEACON].join(" ")}`,
  "font-src 'self'",
  `connect-src 'self' ${[...META, ...GOOGLE_BEACON].join(" ")}`,
  `frame-src ${TURNSTILE} https://td.doubleclick.net https://www.googletagmanager.com`,
].join("; ");

const nextConfig: NextConfig = {
  // Next dev blocks cross-origin requests to dev resources (HMR websocket, RSC
  // payloads) by default. Needed while testing through an ngrok tunnel for the
  // Meta webhook, and for the LAN/Tailscale hostnames used to reach this dev
  // server from another machine — without this the page loads but never
  // hydrates (login submits as a plain GET). Mismos nombres que WAB y Factzi:
  // el servidor es "ludaisca" (renombrado el 2026-09-01), la laptop "ldic".
  allowedDevOrigins: [
    "*.ngrok-free.dev",
    "*.ngrok-free.app",
    "*.ngrok.io",
    "ludaisca",
    "ldic",
    "*.taila2291d.ts.net",
    "100.*.*.*",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
          { key: "Content-Security-Policy", value: CSP },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
            : []),
        ],
      },
      // Media subida por usuarios o recibida de leads: `sandbox` impide que un
      // archivo abierto directamente (p. ej. un SVG con <script>) ejecute
      // código con la sesión del usuario en el origen de la app. Va después de
      // la regla global porque, para la misma clave, gana la última.
      {
        source: "/api/:channel(whatsapp|telegram|messenger|instagram)/messages/:messageId/media",
        headers: [{ key: "Content-Security-Policy", value: "sandbox" }],
      },
    ];
  },
};

export default nextConfig;
