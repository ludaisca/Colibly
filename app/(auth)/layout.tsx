import { getAnalyticsConfig } from "@/lib/analytics/config";
import { Analytics } from "@/app/components/analytics/analytics";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  // La medición llega hasta aquí porque el registro es la conversión que cuenta.
  const analytics = getAnalyticsConfig();
  return (
    <div
      className="min-h-dvh flex items-center justify-center bg-background p-4"
      style={{
        backgroundImage:
          "radial-gradient(circle at 50% 0%, color-mix(in oklab, var(--accent) 8%, transparent), transparent 60%)",
      }}
    >
      <div className="w-full max-w-md">
        {children}
      </div>
      {analytics && <Analytics config={analytics} />}
    </div>
  );
}
