import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { aiSettingsUpdateSchema } from "@/lib/validations";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    let settings = await prisma.appSettings.findUnique({
      where: { userId: session.user.id },
    });

    if (!settings) {
      settings = await prisma.appSettings.create({
        data: { userId: session.user.id },
      });
    }

    return NextResponse.json({
      id: settings.id,
      openrouterApiKey: settings.openrouterApiKey ? "••••••••" : null,
      googleApiKey: settings.googleApiKey ? "••••••••" : null,
      defaultProvider: settings.defaultProvider,
      defaultModel: settings.defaultModel,
      monthlyBudgetUsd: settings.monthlyBudgetUsd,
      leadRecoveryEnabled: settings.leadRecoveryEnabled,
      leadRecoveryFirstMessageHours: settings.leadRecoveryFirstMessageHours,
      leadRecoverySecondMessageHours: settings.leadRecoverySecondMessageHours,
      leadRecoveryBusinessHourStart: settings.leadRecoveryBusinessHourStart,
      leadRecoveryBusinessHourEnd: settings.leadRecoveryBusinessHourEnd,
      leadRecoveryTimezone: settings.leadRecoveryTimezone,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const parsed = aiSettingsUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const body = parsed.data;

    const data: Record<string, unknown> = {};

    if (body.openrouterApiKey !== undefined) {
      data.openrouterApiKey = body.openrouterApiKey ? encrypt(body.openrouterApiKey) : null;
    }
    if (body.googleApiKey !== undefined) {
      data.googleApiKey = body.googleApiKey ? encrypt(body.googleApiKey) : null;
    }
    if (body.defaultProvider) data.defaultProvider = body.defaultProvider;
    if (body.defaultModel) data.defaultModel = body.defaultModel;
    if (body.monthlyBudgetUsd !== undefined) {
      data.monthlyBudgetUsd = body.monthlyBudgetUsd;
      data.budgetAlertMonth = null;
    }

    if (body.leadRecoveryEnabled !== undefined) data.leadRecoveryEnabled = body.leadRecoveryEnabled;
    if (body.leadRecoveryFirstMessageHours !== undefined) data.leadRecoveryFirstMessageHours = body.leadRecoveryFirstMessageHours;
    if (body.leadRecoverySecondMessageHours !== undefined) data.leadRecoverySecondMessageHours = body.leadRecoverySecondMessageHours;
    if (body.leadRecoveryBusinessHourStart !== undefined) data.leadRecoveryBusinessHourStart = body.leadRecoveryBusinessHourStart;
    if (body.leadRecoveryBusinessHourEnd !== undefined) data.leadRecoveryBusinessHourEnd = body.leadRecoveryBusinessHourEnd;
    if (body.leadRecoveryTimezone) data.leadRecoveryTimezone = body.leadRecoveryTimezone;

    const settings = await prisma.appSettings.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, ...data },
      update: data,
    });

    return NextResponse.json({
      id: settings.id,
      openrouterApiKey: settings.openrouterApiKey ? "••••••••" : null,
      googleApiKey: settings.googleApiKey ? "••••••••" : null,
      defaultProvider: settings.defaultProvider,
      defaultModel: settings.defaultModel,
      monthlyBudgetUsd: settings.monthlyBudgetUsd,
      leadRecoveryEnabled: settings.leadRecoveryEnabled,
      leadRecoveryFirstMessageHours: settings.leadRecoveryFirstMessageHours,
      leadRecoverySecondMessageHours: settings.leadRecoverySecondMessageHours,
      leadRecoveryBusinessHourStart: settings.leadRecoveryBusinessHourStart,
      leadRecoveryBusinessHourEnd: settings.leadRecoveryBusinessHourEnd,
      leadRecoveryTimezone: settings.leadRecoveryTimezone,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
