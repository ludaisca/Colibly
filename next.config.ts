import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next dev blocks cross-origin requests to dev resources (HMR websocket, RSC
  // payloads) by default. Needed while testing through an ngrok tunnel for the
  // Meta webhook — without this, HMR silently fails and forces hard reloads.
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app", "*.ngrok.io"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'" },
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
