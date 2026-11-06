import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { templateCreateSchema } from "@/lib/validations";
import { createTemplate, templateInputError } from "@/lib/whatsapp/templates";
import { getUserAccountIds } from "@/lib/shared-accounts";
import { forbidRoles } from "@/lib/roles";
import { publicErrorMessage } from "@/lib/api-errors";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const denied = forbidRoles(session, ["ejecutivo"]);
    if (denied) return denied;

    const body = await req.json().catch(() => null);
    const parsed = templateCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { waAccountId, name, language, category } = parsed.data;

    const inputError = templateInputError(parsed.data);
    if (inputError) return NextResponse.json({ error: inputError }, { status: 400 });

    const accountIds = await getUserAccountIds(session.user.id);

    if (!accountIds.includes(waAccountId)) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const account = await prisma.wAAccount.findFirst({
      where: { id: waAccountId },
    });

    if (!account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    if (account.channel !== "META_CLOUD" || !account.wabaId || !account.accessToken) {
      return NextResponse.json(
        { error: "Esta cuenta no tiene WABA ID configurado. Configúralo antes de crear plantillas." },
        { status: 400 }
      );
    }

    // El nombre es único por idioma en Meta: la misma plantilla puede existir
    // en varios idiomas.
    const existing = await prisma.wATemplate.findFirst({
      where: { waAccountId, name, language, status: { not: "DELETED" } },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Ya existe una plantilla con el nombre "${name}" en ese idioma en esta cuenta` },
        { status: 409 }
      );
    }

    const accessToken = decrypt(account.accessToken);

    const result = await createTemplate(account.wabaId, accessToken, parsed.data);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // upsert: el webhook de estado (o la sincronización de respaldo) puede haber
    // insertado ya la fila entre que Meta aceptó la plantilla y este punto.
    const data = {
      name,
      language,
      category,
      status: "PENDING",
      // La forma de Meta (array de componentes), la misma que deja la
      // sincronización: getTemplateVariables y la vista previa la leen así.
      components: result.components as object,
      syncedAt: new Date(),
    };
    const template = await prisma.wATemplate.upsert({
      where: { waAccountId_templateId: { waAccountId: account.id, templateId: result.templateId } },
      create: { waAccountId: account.id, templateId: result.templateId, ...data },
      update: { components: data.components, syncedAt: data.syncedAt },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
