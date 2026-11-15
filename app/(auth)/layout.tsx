import { getAnalyticsConfig } from "@/lib/analytics/config";
import { Analytics } from "@/app/components/analytics/analytics";
import { connection } from "next/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // La medición llega hasta aquí porque el registro es la conversión que cuenta.
  await connection();
  const analytics = await getAnalyticsConfig();
  return (
    // Columna de 400 px (dirección congelada): logo arriba a la izquierda,
    // título de 22 px, campos de 40 px y botón principal a todo lo ancho. Las
    // tarjetas de cada pantalla se aplanan aquí (sin borde ni fondo propio).
    <div className="flex min-h-dvh justify-center bg-background px-4 py-10 sm:items-center">
      <div className="w-full max-w-[400px] [&_[data-auth-card]]:border-0 [&_[data-auth-card]]:bg-transparent [&_[data-auth-card]]:p-0 [&_input:not([type=checkbox]):not([type=radio])]:h-10 [&_button[type=submit]]:h-10">
        {children}
      </div>
      {analytics && <Analytics config={analytics} />}
    </div>
  );
}
