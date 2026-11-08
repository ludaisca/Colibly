import { CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card } from "@/app/components/ui/card";
import { CsatForm } from "./_form";

export default async function CsatPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const survey = await prisma.csatResponse.findUnique({
    where: { token },
    select: {
      rating: true,
      respondedAt: true,
      account: { select: { name: true } },
      contact: { select: { name: true, remoteJid: true } },
    },
  });

  if (!survey) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md p-6 text-center">
          <h1 className="text-lg font-semibold text-foreground">Enlace no válido</h1>
          <p className="mt-2 text-sm text-muted">Esta encuesta no existe o ya no está disponible.</p>
        </Card>
      </main>
    );
  }

  if (survey.respondedAt) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md p-6 text-center">
          <CheckCircle2 size={28} className="mx-auto text-success" />
          <h1 className="mt-3 text-lg font-semibold text-foreground">Gracias por tu respuesta</h1>
          <p className="mt-1 text-sm text-muted">
            Ya registramos tu calificación de {survey.rating ?? "—"}/5.
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md p-6">
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
          ¿Cómo calificarías la atención?
        </h1>
        <p className="mt-1 text-sm text-muted-darker">{survey.account.name}</p>
        <p className="mt-1 text-sm text-muted">
          {survey.contact.name ?? survey.contact.remoteJid}, tu opinión nos ayuda a mejorar.
        </p>
        <CsatForm token={token} />
      </Card>
    </main>
  );
}
