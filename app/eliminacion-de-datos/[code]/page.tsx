import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BRAND_CONTACT_EMAIL, BRAND_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";
// Las fechas se muestran siempre en hora de México, sin depender de la zona del servidor.
const DATE_FORMAT: Intl.DateTimeFormatOptions = { dateStyle: "long", timeZone: "America/Mexico_City" };
export const metadata = { title: "Solicitud de eliminación de datos", robots: { index: false } };

const STATUS: Record<string, string> = {
  RECEIVED: "Recibida. La estamos procesando.",
  COMPLETED: "Completada. Eliminamos los datos de WhatsApp asociados a tu cuenta de Facebook.",
  NO_DATA: "Completada. No encontramos datos de WhatsApp asociados a tu cuenta de Facebook.",
  MANUAL_REVIEW: "Recibida. La estamos revisando manualmente para borrar tus datos con seguridad; te confirmaremos por correo.",
};

// Página pública de estado que Meta enlaza desde el callback de eliminación de
// datos. Solo muestra el estado del código, sin datos personales.
export default async function DataDeletionStatusPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[a-f0-9]{24}$/.test(code)) notFound();
  const request = await prisma.metaDataDeletionRequest.findUnique({
    where: { confirmationCode: code },
    select: { status: true, receivedAt: true, completedAt: true },
  });
  if (!request) notFound();

  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 py-16">
      <h1 className="text-2xl font-semibold">Solicitud de eliminación de datos</h1>
      <p className="text-sm text-muted-darker">Código de confirmación: <span className="font-mono">{code}</span></p>
      <p>{STATUS[request.status] ?? request.status}</p>
      <p className="text-sm text-muted-darker">
        Recibida el {request.receivedAt.toLocaleDateString("es-MX", DATE_FORMAT)}
        {request.completedAt ? ` · terminada el ${request.completedAt.toLocaleDateString("es-MX", DATE_FORMAT)}` : ""}.
      </p>
      <p className="text-sm text-muted-darker">
        ¿Dudas? Escribe a <a className="text-accent-ink underline" href={`mailto:${BRAND_CONTACT_EMAIL}`}>{BRAND_CONTACT_EMAIL}</a> ({BRAND_NAME}).
      </p>
    </main>
  );
}
