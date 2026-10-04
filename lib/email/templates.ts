import type { EmailMessage } from "./mailer";
import { BRAND_NAME } from "@/lib/brand";
import { BRAND_COLORS } from "@/lib/brand-colors";

// Plantillas de correo: HTML con estilos en línea (los clientes de correo
// ignoran <style> y variables CSS) más versión de texto plano. Los colores van
// fijos a propósito — mismo criterio que <TemplatePreview>: un correo no sigue
// el tema de la app.

const ACCENT = BRAND_COLORS.accent;
const ON_ACCENT = BRAND_COLORS.onAccent;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(input: { title: string; paragraphs: string[]; cta: { label: string; url: string }; footnote: string }): string {
  const body = input.paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND_COLORS.ink}">${p}</p>`).join("");
  return `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:${BRAND_COLORS.background};font-family:Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td>
<p style="margin:0 0 24px;font-size:18px;font-weight:700;color:${BRAND_COLORS.accentInk}">${BRAND_NAME}</p>
<h1 style="margin:0 0 16px;font-size:22px;color:${BRAND_COLORS.ink}">${input.title}</h1>
${body}
<p style="margin:24px 0"><a href="${escapeHtml(input.cta.url)}" style="display:inline-block;background:${ACCENT};color:${ON_ACCENT};text-decoration:none;font-weight:600;padding:12px 22px;border-radius:12px">${input.cta.label}</a></p>
<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:${BRAND_COLORS.muted}">Si el botón no funciona, copia este enlace en tu navegador:<br><span style="word-break:break-all">${escapeHtml(input.cta.url)}</span></p>
<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:${BRAND_COLORS.muted}">${input.footnote}</p>
</td></tr></table></td></tr></table></body></html>`;
}

export function verifyEmailTemplate(input: { to: string; name: string | null; url: string }): EmailMessage {
  const hello = input.name ? `Hola ${input.name},` : "Hola,";
  return {
    to: input.to,
    subject: `Confirma tu correo en ${BRAND_NAME}`,
    html: layout({
      title: "Confirma tu correo",
      paragraphs: [escapeHtml(hello), "Confirma que este correo es tuyo para poder conectar tus canales y activar tu plan."],
      cta: { label: "Confirmar correo", url: input.url },
      footnote: `El enlace vence en 48 horas. Si no creaste una cuenta en ${BRAND_NAME}, ignora este mensaje.`,
    }),
    text: `${hello}\n\nConfirma tu correo en ${BRAND_NAME}:\n${input.url}\n\nEl enlace vence en 48 horas. Si no creaste una cuenta, ignora este mensaje.`,
  };
}

export function passwordResetTemplate(input: { to: string; name: string | null; url: string }): EmailMessage {
  const hello = input.name ? `Hola ${input.name},` : "Hola,";
  return {
    to: input.to,
    subject: `Restablece tu contraseña de ${BRAND_NAME}`,
    html: layout({
      title: "Restablece tu contraseña",
      paragraphs: [escapeHtml(hello), "Recibimos una solicitud para cambiar la contraseña de tu cuenta."],
      cta: { label: "Elegir nueva contraseña", url: input.url },
      footnote: "El enlace vence en 1 hora y solo funciona una vez. Si no lo pediste, ignora este correo: tu contraseña no cambia.",
    }),
    text: `${hello}\n\nPara elegir una nueva contraseña de ${BRAND_NAME} entra a:\n${input.url}\n\nEl enlace vence en 1 hora. Si no lo pediste, ignora este correo.`,
  };
}

const ROLE_LABEL: Record<string, string> = { admin: "administrador", user: "usuario", ejecutivo: "ejecutivo" };

export function invitationTemplate(input: { to: string; organizationName: string; inviterName: string | null; role: string; url: string }): EmailMessage {
  const who = input.inviterName ?? "Un administrador";
  const role = ROLE_LABEL[input.role] ?? input.role;
  const line = `${who} te invitó a unirte a ${input.organizationName} en ${BRAND_NAME} como ${role}.`;
  return {
    to: input.to,
    subject: `Te invitaron a ${input.organizationName} en ${BRAND_NAME}`,
    html: layout({
      title: "Tienes una invitación",
      paragraphs: [escapeHtml(line), "Crea tu contraseña para empezar a atender conversaciones con tu equipo."],
      cta: { label: "Aceptar invitación", url: input.url },
      footnote: "La invitación vence en 7 días. Si no esperabas este correo, puedes ignorarlo.",
    }),
    text: `${line}\n\nAcepta la invitación aquí:\n${input.url}\n\nVence en 7 días.`,
  };
}

// Avisos de facturación (prueba por vencer, pago fallido, solo lectura…).
export function billingNoticeTemplate(input: { to: string; title: string; paragraphs: string[]; ctaLabel: string; url: string }): EmailMessage {
  return {
    to: input.to,
    subject: input.title,
    html: layout({
      title: escapeHtml(input.title),
      paragraphs: input.paragraphs.map(escapeHtml),
      cta: { label: escapeHtml(input.ctaLabel), url: input.url },
      footnote: `Recibes este correo porque administras una cuenta de ${BRAND_NAME}.`,
    }),
    text: `${input.title}\n\n${input.paragraphs.join("\n\n")}\n\n${input.ctaLabel}: ${input.url}`,
  };
}
