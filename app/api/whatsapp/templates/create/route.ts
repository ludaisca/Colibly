import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { templateCreateSchema } from "@/lib/validations";
import { createAccountTemplate, TemplateCreateError } from "@/lib/whatsapp/template-create";
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

    const accountIds = await getUserAccountIds(session.user.id);
    const account = accountIds.includes(parsed.data.waAccountId)
      ? await prisma.wAAccount.findFirst({ where: { id: parsed.data.waAccountId } })
      : null;
    if (!account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    try {
      const template = await createAccountTemplate(account, parsed.data);
      return NextResponse.json(template, { status: 201 });
    } catch (err) {
      // 422 de la API pública = el 400 que esta ruta siempre dio.
      if (err instanceof TemplateCreateError) return NextResponse.json({ error: err.message }, { status: err.status === 422 ? 400 : err.status });
      throw err;
    }
  } catch (error) {
    const message =
      publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
