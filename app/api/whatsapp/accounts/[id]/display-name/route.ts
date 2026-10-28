import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccountIds } from "@/lib/shared-accounts";
import { getDisplayNameState } from "@/lib/whatsapp/display-name";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  if (!(await getUserAccountIds(session.user.id)).includes(id)) {
    return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  }

  const account = await prisma.wAAccount.findFirst({
    where: { id },
    select: { phoneNumberId: true, accessToken: true },
  });
  if (!account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });

  const state = await getDisplayNameState(account);
  // `known` distingue "Meta dijo que no" de "no se pudo preguntar": la UI solo
  // bloquea la conversación en el primer caso.
  return NextResponse.json({ approved: state === "approved", known: state !== "unknown" });
}
