import { NextResponse } from "next/server";
import { betaApplicationSchema } from "@/lib/beta-application";
import { BRAND_CONTACT_EMAIL } from "@/lib/brand";
import { sendEmail } from "@/lib/email/mailer";
import { rateLimit } from "@/lib/rate-limit";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function POST(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
  const [perIp, global] = await Promise.all([
    rateLimit(`beta-application:${ip}`, 3, 3600),
    rateLimit("beta-application:global", 100, 86400),
  ]);
  if (!perIp.allowed || !global.allowed) {
    return NextResponse.json({ error: "Recibimos demasiadas solicitudes. Intenta más tarde." }, { status: 429 });
  }

  if (Number(req.headers.get("content-length") ?? 0) > 8192) {
    return NextResponse.json({ error: "La solicitud es demasiado grande." }, { status: 413 });
  }
  const raw = await req.text().catch(() => "");
  if (raw.length > 8192) {
    return NextResponse.json({ error: "La solicitud es demasiado grande." }, { status: 413 });
  }
  let body: unknown = null;
  try { body = JSON.parse(raw); } catch {}
  const parsed = betaApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Revisa tus datos." }, { status: 400 });
  }
  const { name, businessName, email, phone, description, website } = parsed.data;
  if (website) return NextResponse.json({ success: true }, { status: 201 });

  const lines = [
    `Nombre: ${name}`,
    `Negocio: ${businessName}`,
    `Correo: ${email}`,
    `WhatsApp: ${phone}`,
    `Cómo atienden hoy: ${description || "No indicado"}`,
  ];

  try {
    await sendEmail({
      to: BRAND_CONTACT_EMAIL,
      replyTo: email,
      subject: `Solicitud de beta · ${businessName}`,
      text: `Nueva solicitud para la beta de Colibly\n\n${lines.join("\n")}`,
      html: `<h1>Nueva solicitud para la beta de Colibly</h1>${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}`,
    });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("[beta] No se pudo entregar la solicitud", error);
    return NextResponse.json({ error: "No pudimos enviar tu solicitud. Inténtalo más tarde o escríbenos por correo." }, { status: 503 });
  }
}
