import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { listPlatformAdminEmails } from "@/lib/platform-admin";
import { getPlatformDiagnostics } from "@/lib/platform/diagnostics";
import { purgePlatformAudit } from "@/lib/platform/audit";
import { sendEmailSafely } from "@/lib/email/mailer";
import { billingNoticeTemplate } from "@/lib/email/templates";

// Chequeo diario del doctor. Notifica solo cuando un check pasa a fallar o se
// recupera, para no mandar el mismo correo todos los días. Guarda cada corrida
// 90 días y aprovecha para purgar la auditoría vieja.

const RETENTION_DAYS = 90;

function failingIds(checks: unknown): string[] {
  if (!Array.isArray(checks)) return [];
  return (checks as Array<{ id?: unknown; status?: unknown }>)
    .filter((item) => item && typeof item === "object" && item.status === "fail")
    .map((item) => String(item.id ?? ""))
    .filter(Boolean);
}

async function notifyAdmins(input: {
  report: Awaited<ReturnType<typeof getPlatformDiagnostics>>;
  newFailures: string[];
  recovered: string[];
}): Promise<void> {
  const failing = input.report.checks.filter((check) => check.status === "fail");
  const paragraphs = [
    input.newFailures.length > 0
      ? `Nuevas fallas: ${input.newFailures.join(", ")}.`
      : "Sin fallas nuevas.",
    ...failing.map((check) => `${check.label}: ${check.message}${check.hint ? ` — ${check.hint}` : ""}`),
    ...(input.recovered.length > 0 ? [`Se recuperaron: ${input.recovered.join(", ")}.`] : []),
  ];

  await Promise.all(
    listPlatformAdminEmails().map((to) =>
      sendEmailSafely(
        billingNoticeTemplate({
          to,
          title: "Alerta de plataforma",
          paragraphs,
          ctaLabel: "Abrir diagnóstico",
          url: appUrl("/plataforma"),
        }),
        "platform-health"
      )
    )
  );
}

export async function processPlatformHealthTick(): Promise<void> {
  const startedAt = new Date();
  try {
    const report = await getPlatformDiagnostics({ live: true });
    const previous = await prisma.platformHealthRun.findFirst({
      orderBy: { startedAt: "desc" },
      select: { checks: true },
    });
    const previousFailing = new Set(failingIds(previous?.checks));
    const currentFailing = failingIds(report.checks);
    const newFailures = currentFailing.filter((id) => !previousFailing.has(id));
    const recovered = [...previousFailing].filter((id) => !currentFailing.includes(id));
    const shouldNotify = newFailures.length > 0 || recovered.length > 0;

    await prisma.platformHealthRun.create({
      data: {
        startedAt,
        finishedAt: new Date(),
        status: report.status,
        checks: report.checks as unknown as Prisma.InputJsonValue,
        notifiedAt: shouldNotify ? new Date() : null,
      },
    });

    if (shouldNotify) await notifyAdmins({ report, newFailures, recovered });

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await prisma.platformHealthRun.deleteMany({ where: { startedAt: { lt: cutoff } } });
    await purgePlatformAudit();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    await prisma.platformHealthRun
      .create({
        data: { startedAt, finishedAt: new Date(), status: "error", checks: [], error: message },
      })
      .catch(() => undefined);
    console.error("[platform-health] falló el chequeo:", message);
  }
}
