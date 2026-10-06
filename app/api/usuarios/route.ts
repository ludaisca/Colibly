import { countOwnedRecords, reassignOwnedRecords } from "@/lib/crm/reassign";
import { NextResponse } from "next/server";
import { auth, invalidateUserSessionCache } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { emailField } from "@/lib/validations";
import { publicErrorMessage } from "@/lib/api-errors";
import { requireOrgId } from "@/lib/tenancy";
import { checkPlanLimit } from "@/lib/billing/gates";

const createUserSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  email: emailField,
  password: z.string().min(8, "Mínimo 8 caracteres"),
  role: z.enum(["admin", "user", "ejecutivo"]).default("user"),
  maxOpenChats: z.number().int().positive().nullable().optional(),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // Solo los miembros de SU organización (antes: todos los usuarios del sistema).
    const users = await prisma.user.findMany({
      where: { organizationId: await requireOrgId(session.user.id) },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        disabledAt: true,
        createdAt: true,
        waAccounts: { select: { id: true, name: true } },
        ownedOrganization: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(users.map(({ ownedOrganization, ...user }) => ({ ...user, isOwner: !!ownedOrganization })));
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { allowed } = await rateLimit(`user-role-change:${session.user.id}`, 20, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes, espera un momento" }, { status: 429 });
    }

    const body = await req.json();
    const validated = z.object({
      userId: z.string().min(1, "userId requerido"),
      role: z.enum(["admin", "user", "ejecutivo"]).optional(),
      // true desactiva (no puede iniciar sesión y sus sesiones se invalidan),
      // false lo reactiva.
      disabled: z.boolean().optional(),
      // Al desactivar: a quién pasan sus contactos y empresas (obligatorio si tiene).
      reassignToUserId: z.string().min(1).optional(),
    }).refine((d) => d.role !== undefined || d.disabled !== undefined, {
      message: "Indica role o disabled",
    }).safeParse(body);

    if (!validated.success) {
      return NextResponse.json({ error: validated.error.issues[0].message }, { status: 400 });
    }

    const { userId, role, disabled, reassignToUserId } = validated.data;

    const orgId = await requireOrgId(session.user.id);
    const target = await prisma.user.findFirst({
      where: { id: userId, organizationId: orgId },
      select: { id: true, role: true, disabledAt: true, ownedOrganization: { select: { id: true } } },
    });
    if (!target) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    // Invariante de cada organización: su dueño nunca pierde acceso total, y
    // nunca se queda sin un admin ACTIVO (uno desactivado no administra nada).
    const losesAdmin =
      target.role === "admin" && !target.disabledAt && ((role !== undefined && role !== "admin") || disabled === true);
    if (losesAdmin) {
      if (target.ownedOrganization) {
        return NextResponse.json(
          { error: "El dueño de la cuenta no puede perder su rol ni ser desactivado" },
          { status: 400 }
        );
      }
      const activeAdminCount = await prisma.user.count({ where: { organizationId: orgId, role: "admin", disabledAt: null } });
      if (activeAdminCount <= 1) {
        return NextResponse.json(
          { error: "No puedes dejar la cuenta sin ningún administrador activo" },
          { status: 400 }
        );
      }
    }
    if (disabled === true && target.id === session.user.id) {
      return NextResponse.json({ error: "No puedes desactivar tu propia cuenta" }, { status: 400 });
    }
    // Reactivar ocupa un lugar del plan (desactivar lo libera).
    if (disabled === false && target.disabledAt) {
      const overLimit = await checkPlanLimit(orgId, "users");
      if (overLimit) return overLimit;
    }

    // Al desactivar, sus contactos, empresas y negocios abiertos pasan a otro responsable.
    const disabling = disabled === true && !target.disabledAt;
    let reassignTo: string | null = null;
    if (disabling) {
      const owned = await countOwnedRecords(orgId, userId);
      if (owned.people + owned.companies + owned.deals > 0) {
        if (!reassignToUserId) {
          return NextResponse.json(
            { error: "Este usuario es responsable de contactos, empresas o negocios. Elige a quién pasárselos.", code: "needs_reassign", ...owned },
            { status: 409 }
          );
        }
        const dest = await prisma.user.findFirst({ where: { id: reassignToUserId, organizationId: orgId, disabledAt: null }, select: { id: true } });
        if (!dest || dest.id === userId) {
          return NextResponse.json({ error: "El nuevo responsable debe ser otro usuario activo de tu organización" }, { status: 400 });
        }
        reassignTo = dest.id;
      }
    }

    const user = await prisma.$transaction(async (tx) => {
      if (disabling && reassignTo) await reassignOwnedRecords(tx, orgId, userId, reassignTo, session.user.id);
      return tx.user.update({
        where: { id: userId },
        data: {
          ...(role !== undefined ? { role } : {}),
          ...(disabling ? { disabledAt: new Date(), sessionVersion: { increment: 1 } } : {}),
          ...(disabled === false ? { disabledAt: null } : {}),
        },
        select: { id: true, name: true, email: true, role: true, disabledAt: true },
      });
    });
    // Aplica ya en este proceso; en los demás, en ≤ 60 s (ver lib/auth.ts).
    invalidateUserSessionCache(userId);

    return NextResponse.json(user);
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { allowed } = await rateLimit(`user-create:${session.user.id}`, 10, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes, espera un momento" }, { status: 429 });
    }

    const body = await req.json();
    const parsed = createUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { name, email, password, role, maxOpenChats } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email ya registrado" }, { status: 409 });
    }

    const organizationId = await requireOrgId(session.user.id);
    const overLimit = await checkPlanLimit(organizationId, "users");
    if (overLimit) return overLimit;

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword, role, maxOpenChats: maxOpenChats ?? null, organizationId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    const message = publicErrorMessage(error, "Error interno");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
