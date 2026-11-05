import { AlertTriangle } from "lucide-react";
import { BRAND_CONTACT_EMAIL } from "@/lib/brand";

// Piezas compartidas de /terminos y /privacidad. Los textos son BORRADORES:
// los datos entre corchetes y el contenido deben revisarse con un abogado
// antes de abrir el registro al público.

// Datos de la empresa pendientes: mientras sigan así, la página muestra el
// aviso de borrador y los marcadores resaltados.
export const LEGAL = {
  // Razón social del responsable (decidido el 2026-11-05).
  company: "Colibly Inc.",
  address: "el que se indique escribiendo a contacto@colibly.com",
  // Buzón del dominio de la marca: debe existir antes del lanzamiento.
  email: BRAND_CONTACT_EMAIL,
  jurisdiction: "los Estados Unidos Mexicanos",
  updatedAt: "5 de noviembre de 2026",
};

export function Blank({ children }: { children: React.ReactNode }) {
  return <mark className="rounded bg-warning-bg px-1 text-warning">{children}</mark>;
}

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:py-12 md:px-6">
      <div className="mb-8 flex gap-3 rounded-xl border border-warning-border bg-warning-bg p-4 text-sm">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
        <p className="min-w-0 text-pretty">
          <strong>Versión provisional.</strong> Este texto se mantendrá actualizado y será reemplazado por la
          versión revisada por un profesional legal.
        </p>
      </div>
      <h1 className="text-balance font-display text-page-title font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted">Última actualización: {LEGAL.updatedAt}</p>
      <div className="mt-8 min-w-0 space-y-6 overflow-x-clip text-[15px] leading-relaxed text-foreground [&_a]:break-words [&_h2]:mt-10 [&_h2]:text-pretty [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:mt-1.5 [&_li]:list-disc [&_li]:text-pretty [&_p]:text-pretty [&_p]:text-foreground/90">
        {children}
      </div>
      <nav aria-label="Más información" className="mt-12 flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-6 text-sm text-muted sm:gap-x-5">
        <a href="/contacto" className="min-h-11 inline-flex items-center hover:text-foreground hover:underline md:min-h-0">Contacto y soporte</a>
        <a href="/eliminar-datos" className="min-h-11 inline-flex items-center hover:text-foreground hover:underline md:min-h-0">Eliminar mis datos</a>
        <a href="/precios" className="min-h-11 inline-flex items-center hover:text-foreground hover:underline md:min-h-0">Planes y precios</a>
        <a href="/terminos" className="min-h-11 inline-flex items-center hover:text-foreground hover:underline md:min-h-0">Términos</a>
        <a href="/privacidad" className="min-h-11 inline-flex items-center hover:text-foreground hover:underline md:min-h-0">Privacidad</a>
        <a href="/privacidad#cookies" className="min-h-11 inline-flex items-center hover:text-foreground hover:underline md:min-h-0">Cookies y medición</a>
      </nav>
    </article>
  );
}
