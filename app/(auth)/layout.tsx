import { getAnalyticsConfig } from "@/lib/analytics/config";
import { Analytics } from "@/app/components/analytics/analytics";
import { connection } from "next/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // La medición llega hasta aquí porque el registro es la conversión que cuenta.
  await connection();
  const analytics = await getAnalyticsConfig();
  return (
    <div
      className="min-h-dvh flex items-center justify-center bg-background p-4"
    >
      <div className="w-full max-w-md">
        {children}
      </div>
      {analytics && <Analytics config={analytics} />}
    </div>
  );
}
