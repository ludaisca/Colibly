import { NextResponse } from "next/server";
import { auth, invalidateUserSessionCache } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { emailField } from "@/lib/validations";

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

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        disabledAt: true,
        createdAt: true,
        waAccounts: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(users);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
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
    }).refine((d) => d.role !== undefined || d.disabled !== undefined, {
      message: "Indica role o disabled",
    }).safeParse(body);

    if (!validated.success) {
      return NextResponse.json({ error: validated.error.issues[0].message }, { status: 400 });
    }

    const { userId, role, disabled } = validated.data;

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, disabledAt: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    // Invariante del sistema: el primer usuario registrado es el admin y nunca
    // debe perder acceso total, y el sistema jamás puede quedarse sin un admin
    // ACTIVO (uno desactivado no puede administrar nada).
    const losesAdmin =
      target.role === "admin" && !target.disabledAt && ((role !== undefined && role !== "admin") || disabled === true);
    if (losesAdmin) {
      const [firstUser, activeAdminCount] = await Promise.all([
        prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }),
        prisma.user.count({ where: { role: "admin", disabledAt: null } }),
      ]);
      if (firstUser?.id === target.id) {
        return NextResponse.json(
          { error: "El administrador principal no puede perder su rol ni ser desactivado" },
          { status: 400 }
        );
      }
      if (activeAdminCount <= 1) {
        return NextResponse.json(
          { error: "No puedes dejar el sistema sin ningún administrador activo" },
          { status: 400 }
        );
      }
    }
    if (disabled === true && target.id === session.user.id) {
      return NextResponse.json({ error: "No puedes desactivar tu propia cuenta" }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(role !== undefined ? { role } : {}),
        ...(disabled === true && !target.disabledAt
          ? { disabledAt: new Date(), sessionVersion: { increment: 1 } }
          : {}),
        ...(disabled === false ? { disabledAt: null } : {}),
      },
      select: { id: true, name: true, email: true, role: true, disabledAt: true },
    });
    // Aplica ya en este proceso; en los demás, en ≤ 60 s (ver lib/auth.ts).
    invalidateUserSessionCache(userId);

    return NextResponse.json(user);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
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

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword, role, maxOpenChats: maxOpenChats ?? null },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
