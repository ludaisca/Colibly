import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { MAX_TRIAL_EXTENSION_DAYS } from "@/lib/billing/state";
import { publicErrorMessage } from "@/lib/api-errors";
import {
  extendOrgTrial,
  grantOrgCredits,
  reactivateOrg,
  setOrgChannelSwitches,
  setOrgInternal,
  suspendOrg,
  type OpsResult,
  type PlatformActor,
} from "@/lib/platform/ops";

const MAX_BONUS_CREDITS = 100_000;

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("extend_trial"), days: z.number().int().min(1).max(MAX_TRIAL_EXTENSION_DAYS) }),
  z.object({ action: z.literal("grant_credits"), credits: z.number().int().min(1).max(MAX_BONUS_CREDITS) }),
  z.object({ action: z.literal("suspend") }),
  z.object({ action: z.literal("reactivate") }),
  z.object({ action: z.literal("set_internal"), internal: z.boolean() }),
  // Coexistencia de WhatsApp (conectar el número de la app WhatsApp Business).
  z.object({ action: z.literal("set_whatsapp_coexistence"), enabled: z.boolean() }),
  // WhatsApp por QR (GoWA, no oficial): solo por invitación del operador.
  z.object({ action: z.literal("set_whatsapp_web"), enabled: z.boolean() }),
  z.object({
    action: z.literal("set_channels"),
    telegram: z.boolean(),
    messenger: z.boolean(),
    instagram: z.boolean(),
    webchat: z.boolean(),
  }),
]);
type Action = z.infer<typeof actionSchema>;

// Acciones del operador sobre una organización (panel /plataforma). La lógica
// vive en lib/platform/ops.ts, la misma que usan la API de tokens y el MCP:
// cada acción queda en PlatformAuditLog con el correo del operador.
function run(id: string, input: Action, actor: PlatformActor): Promise<OpsResult<unknown>> {
  switch (input.action) {
    case "extend_trial":
      return extendOrgTrial(id, input.days, actor);
    case "grant_credits":
      return grantOrgCredits(id, input.credits, actor);
    case "suspend":
      return suspendOrg(id, actor);
    case "reactivate":
      return reactivateOrg(id, actor);
    case "set_internal":
      return setOrgInternal(id, input.internal, actor);
    case "set_whatsapp_coexistence":
      return setOrgChannelSwitches(id, { whatsappCoexistenceEnabled: input.enabled }, actor);
    case "set_whatsapp_web":
      return setOrgChannelSwitches(id, { channelWhatsappWebEnabled: input.enabled }, actor);
    case "set_channels":
      return setOrgChannelSwitches(
        id,
        {
          channelTelegramEnabled: input.telegram,
          channelMessengerEnabled: input.messenger,
          channelInstagramEnabled: input.instagram,
          channelWebchatEnabled: input.webchat,
        },
        actor
      );
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;

  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  try {
    const result = await run(id, parsed.data, { type: "user", email: admin.email });
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id },
      select: {
        status: true,
        isInternal: true,
        trialEndsAt: true,
        aiCreditsBonus: true,
        channelTelegramEnabled: true,
        channelMessengerEnabled: true,
        channelInstagramEnabled: true,
        channelWebchatEnabled: true,
        whatsappCoexistenceEnabled: true,
        channelWhatsappWebEnabled: true,
      },
    });
    return NextResponse.json({ organization });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "No se pudo aplicar la acción") }, { status: 500 });
  }
}
