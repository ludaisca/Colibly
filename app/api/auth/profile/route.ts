import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

import { SIGNATURE_MAX_LENGTH } from "@/lib/inbox/signature";

// Todo opcional: la pantalla de Cuenta y la de firma guardan por separado.
const profileSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100, "Nombre demasiado largo").optional(),
  messageSignature: z.string().trim().max(SIGNATURE_MAX_LENGTH, `Máximo ${SIGNATURE_MAX_LENGTH} caracteres`).nullable().optional()
    .transform((v) => (v ? v : v === undefined ? undefined : null)),
  signatureEnabled: z.boolean().optional(),
});

const PROFILE_SELECT = { id: true, name: true, email: true, role: true, messageSignature: true, signatureEnabled: true } as const;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: PROFILE_SELECT });
  return NextResponse.json(user);
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = profileSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: parsed.data,
      select: PROFILE_SELECT,
    });

    return NextResponse.json(user);
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
