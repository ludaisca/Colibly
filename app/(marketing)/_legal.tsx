import { AlertTriangle } from "lucide-react";
import { BRAND_CONTACT_EMAIL } from "@/lib/brand";

// Piezas compartidas de /terminos y /privacidad. Los textos son BORRADORES:
// los datos entre corchetes y el contenido deben revisarse con un abogado
// antes de abrir el registro al público.

// Datos de la empresa; la página muestra siempre el aviso de versión provisional.
export const LEGAL = {
  company: "Colibly",
  // Buzón del dominio de la marca: debe existir antes del lanzamiento.
  email: BRAND_CONTACT_EMAIL,
  jurisdiction: "los Estados Unidos Mexicanos",
  updatedAt: "4 de octubre de 2026",
};

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 md:px-6">
      <div className="mb-8 flex gap-3 rounded-xl border border-warning-border bg-warning-bg p-4 text-sm">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
        <p>
          <strong>Versión provisional para la beta.</strong> Este texto se mantendrá actualizado y será reemplazado por la
          versión revisada antes del lanzamiento general.
        </p>
      </div>
      <h1 className="font-display text-page-title font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted">Última actualización: {LEGAL.updatedAt}</p>
      <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-foreground [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_li]:mt-1.5 [&_p]:text-foreground/90">
        {children}
      </div>
    </article>
  );
}
