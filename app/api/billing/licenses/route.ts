import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { requireOrgId } from "@/lib/tenancy";
import { requireVerifiedEmail } from "@/lib/auth-emails";
import { isStripeConfigured, planPriceError } from "@/lib/billing/stripe";
import { applyLicenseChange, getLicenseState, licenseResultResponse, suggestedLicense } from "@/lib/billing/license-billing";
import { LICENSE_ORDER, TRIAL_MAX_USERS } from "@/lib/billing/licenses";
import { licenseCountsSchema } from "@/lib/validations";

const schema = z.object({ licenses: licenseCountsSchema });

// Cambiar cuántas licencias de cada plan se contratan en la suscripción
// vigente (solo admin). En una organización del catálogo anterior, pasarse a
// licencias. Stripe prorratea (subir cobra al momento).
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Solo un administrador puede cambiar las licencias" }, { status: 403 });
    }
    const { allowed } = await rateLimit(`billing-licenses:${session.user.id}`, 10, 600);
    if (!allowed) return NextResponse.json({ error: "Demasiados intentos, espera un momento" }, { status: 429 });
    if (!(await isStripeConfigured())) {
      return NextResponse.json({ error: "Los pagos aún no están habilitados. Escríbenos para cambiar tus licencias." }, { status: 503 });
    }
    const unverified = await requireVerifiedEmail(session.user.id);
    if (unverified) return unverified;

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    for (const plan of LICENSE_ORDER) {
      if (parsed.data.licenses[plan] === 0) continue;
      const priceError = await planPriceError(plan);
      if (priceError) return NextResponse.json({ error: priceError, code: "price_mismatch" }, { status: 503 });
    }

    const result = await applyLicenseChange(await requireOrgId(session.user.id), parsed.data.licenses);
    if (!result.ok) return licenseResultResponse(result);
    return NextResponse.json({ ok: true, changed: result.changed });
  } catch (error) {
    console.error("[billing/licenses]", error);
    return NextResponse.json({ error: "No se pudieron actualizar tus licencias. Intenta de nuevo en un momento." }, { status: 500 });
  }
}

// Licencias contratadas, asignadas y libres por plan (solo admin): lo leen
// /usuarios (invitar, crear, cambiar licencia) y la pantalla del plan.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const organizationId = await requireOrgId(session.user.id);
    const [state, suggested] = await Promise.all([getLicenseState(organizationId), suggestedLicense(organizationId)]);
    if (!state) return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });
    return NextResponse.json({ ...state, legacyUntil: state.legacyUntil?.toISOString() ?? null, suggested, trialMaxUsers: TRIAL_MAX_USERS });
  } catch (error) {
    console.error("[billing/licenses GET]", error);
    return NextResponse.json({ error: "No se pudieron leer tus licencias" }, { status: 500 });
  }
}
