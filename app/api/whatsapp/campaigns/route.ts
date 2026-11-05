import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { campaignSchema } from "@/lib/validations";
import { getUserAccountIds } from "@/lib/shared-accounts";
import { forbidRoles } from "@/lib/roles";
import { publicErrorMessage } from "@/lib/api-errors";
import { requireOrgId } from "@/lib/tenancy";
import { checkPlanLimit } from "@/lib/billing/gates";
import { checkChannelFeature, checkUserFeature } from "@/lib/billing/entitlements";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const denied = forbidRoles(session, ["ejecutivo"]);
    if (denied) return denied;

    const body = await req.json().catch(() => null);
    const parsed = campaignSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { name, waAccountId, waTemplateId, scheduledAt, headerParam, buttonParam, recipients } =
      parsed.data;

    // Tolerancia de 1 min para no rechazar un "programar para ahora mismo"
    // que cruzó el minuto mientras el usuario llenaba el formulario.
    if (scheduledAt && new Date(scheduledAt).getTime() < Date.now() - 60_000) {
      return NextResponse.json(
        { error: "La fecha programada ya pasó — elige una fecha futura" },
        { status: 400 }
      );
    }

    const accountIds = await getUserAccountIds(session.user.id);

    if (!accountIds.includes(waAccountId)) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const [account, template] = await Promise.all([
      prisma.wAAccount.findFirst({
        where: { id: waAccountId },
      }),
      prisma.wATemplate.findFirst({
        where: { id: waTemplateId, waAccountId, status: "APPROVED" },
      }),
    ]);

    if (!account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }
    if (!template) {
      return NextResponse.json(
        { error: "La plantilla no está aprobada o no existe" },
        { status: 400 }
      );
    }

    // Cada destinatario que aún no es contacto se vuelve uno al enviarle: la
    // campaña no puede pasar el límite de contactos del plan.
    const organizationId = await requireOrgId(session.user.id);
    // Quien la crea necesita la función en su licencia y el número la necesita
    // en la de su dueño: el envío corre con la del canal (reglas 3 y 4).
    const noCampaigns = (await checkUserFeature(session.user.id, "campaigns")) ?? (await checkChannelFeature({ waAccountId }, "campaigns"));
    if (noCampaigns) return noCampaigns;
    const phones = [...new Set(recipients.map((r) => r.phoneNumber))];
    const known = await prisma.contact.count({ where: { accountId: waAccountId, remoteJid: { in: phones } } });
    const adding = phones.length - known;
    const overContacts = await checkPlanLimit(organizationId, "contacts", adding);
    if (overContacts) return overContacts;
    const overLeads = await checkPlanLimit(organizationId, "activeLeads", adding);
    if (overLeads) return overLeads;

    const campaign = await prisma.$transaction(async (tx) => {
      const created = await tx.wACampaign.create({
        data: {
          userId: session.user.id,
          organizationId,
          waAccountId,
          waTemplateId,
          name,
          status: scheduledAt ? "SCHEDULED" : "DRAFT",
          scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
          headerParam: headerParam || null,
          buttonParam: buttonParam || null,
          recipientCount: recipients.length,
        },
        include: {
          waAccount: { select: { id: true, name: true, phoneNumber: true } },
          waTemplate: { select: { id: true, name: true } },
        },
      });

      await tx.wACampaignRecipient.createMany({
        data: recipients.map((r) => ({
          campaignId: created.id,
          phoneNumber: r.phoneNumber,
          contactName: r.contactName ?? undefined,
          parameters: r.parameters ?? undefined,
        })),
      });

      return created;
    });

    return NextResponse.json(campaign, { status: 201 });
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(_req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Visibilidad por cuenta, no por creador: quien comparte una cuenta debe
    // ver las campañas que otros lanzan sobre su número (y viceversa) — misma
    // regla que chats/contactos/plantillas.
    const accountIds = await getUserAccountIds(session.user.id);

    const campaigns = await prisma.wACampaign.findMany({
      where: { waAccountId: { in: accountIds } },
      select: {
        id: true,
        name: true,
        status: true,
        scheduledAt: true,
        sentAt: true,
        completedAt: true,
        recipientCount: true,
        sentCount: true,
        deliveredCount: true,
        readCount: true,
        failedCount: true,
        createdAt: true,
        updatedAt: true,
        waAccount: { select: { id: true, name: true, phoneNumber: true } },
        waTemplate: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(campaigns);
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
