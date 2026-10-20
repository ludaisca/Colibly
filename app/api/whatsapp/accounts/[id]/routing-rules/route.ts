import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { routingRuleSchema } from "@/lib/validations";
import { getEligibleAssignees } from "@/lib/chat-assignees";
import { forbidRoles } from "@/lib/roles";
import { publicErrorMessage } from "@/lib/api-errors";
import { accountManageWhere } from "@/lib/tenancy";

// Roadmap P3-d — reglas de enrutamiento de auto-asignación
// (WAAccountRoutingRule). Mismo alcance que el toggle autoAssignEnabled del
// que dependen (PATCH /api/whatsapp/accounts/[id]): solo el dueño de la
// cuenta, no admin-gated globalmente ni abierto a WAAccountShare — configurar
// A QUIÉN se enrutan los chats es una decisión del dueño, distinta de
// "Compartir cuenta" (que sí es admin-only en accounts/[id]/share).

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const account = await prisma.wAAccount.findFirst({ where: { id, ...(await accountManageWhere(session.user.id)) } });
    if (!account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const rules = await prisma.wAAccountRoutingRule.findMany({
      where: { waAccountId: id },
      orderBy: { order: "asc" },
      select: {
        id: true,
        order: true,
        conditionType: true,
        conditionValue: true,
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });

    // El nombre de la etiqueta no vive en la regla (solo su id) — se resuelve
    // aquí para que la UI no tenga que cruzar con GET /api/whatsapp/tags.
    const tagIds = rules.filter((r) => r.conditionType === "TAG").map((r) => r.conditionValue);
    const tags = tagIds.length > 0
      ? await prisma.tag.findMany({ where: { id: { in: tagIds } }, select: { id: true, name: true } })
      : [];
    const tagNameById = new Map(tags.map((t) => [t.id, t.name]));

    // Se incluye aquí (no vía /api/whatsapp/accounts/[id]/share ni
    // /api/usuarios, ambos admin-only) para que un dueño de cuenta con rol
    // "user" también pueda ver a quién puede enrutar — el toggle
    // autoAssignEnabled del que dependen estas reglas tampoco es admin-gated.
    const eligibleAssignees = await getEligibleAssignees(id);

    return NextResponse.json({
      rules: rules.map((r) => ({
        ...r,
        conditionLabel: r.conditionType === "TAG" ? tagNameById.get(r.conditionValue) ?? r.conditionValue : r.conditionValue,
      })),
      eligibleAssignees,
    });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const denied = forbidRoles(session, ["ejecutivo"]);
    if (denied) return denied;

    const { id } = await params;
    const account = await prisma.wAAccount.findFirst({ where: { id, ...(await accountManageWhere(session.user.id)) } });
    if (!account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    const parsed = routingRuleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { conditionType, conditionValue, assignedToId } = parsed.data;

    // El destinatario debe tener acceso real a esta cuenta (dueño o
    // WAAccountShare) — mismo criterio que ya usa getEligibleAssignees() para
    // el picker de "Asignar a" manual, para no poder enrutar a alguien sin
    // visibilidad sobre estos chats.
    const eligible = await getEligibleAssignees(id);
    if (!eligible.some((u) => u.id === assignedToId)) {
      return NextResponse.json({ error: "El usuario no tiene acceso a esta cuenta" }, { status: 400 });
    }

    if (conditionType === "TAG") {
      const tag = await prisma.tag.findUnique({ where: { id: conditionValue } });
      if (!tag || tag.waAccountId !== id) {
        return NextResponse.json({ error: "Etiqueta no encontrada" }, { status: 404 });
      }
    } else if (conditionType === "LEAD_ORIGIN") {
      if (!["ORGANIC", "INSTANT_FORM", "CTWA"].includes(conditionValue)) {
        return NextResponse.json({ error: "Origen de lead inválido" }, { status: 400 });
      }
    } else if (conditionType === "SCORE_LABEL") {
      if (!["descartado", "frio", "interesado", "oportunidad", "prioridad_alta"].includes(conditionValue)) {
        return NextResponse.json({ error: "Label de calificación inválido" }, { status: 400 });
      }
    }

    const last = await prisma.wAAccountRoutingRule.findFirst({
      where: { waAccountId: id },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const rule = await prisma.wAAccountRoutingRule.create({
      data: {
        waAccountId: id,
        order: (last?.order ?? -1) + 1,
        conditionType,
        conditionValue,
        assignedToId,
      },
      select: {
        id: true,
        order: true,
        conditionType: true,
        conditionValue: true,
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno del servidor");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
