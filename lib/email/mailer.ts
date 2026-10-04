import nodemailer, { type Transporter } from "nodemailer";
import { BRAND_NAME, BRAND_DOMAIN } from "@/lib/brand";
import { getPlatformSettings } from "@/lib/platform-settings";

// Envío de correo transaccional por SMTP (Resend, Brevo, SES… todos lo
// hablan). Configuración editable desde /plataforma — ver
// lib/platform-settings.ts. Sin SMTP host, en desarrollo el correo se imprime
// en el log del contenedor; en producción falta de configuración es un error,
// no un silencio — un registro cuyo correo de verificación nunca sale deja al
// cliente atorado.

export interface EmailMessage {
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}

// Sin caché de instancia a propósito: la config puede cambiar desde la GUI y
// construir el transporter no abre conexión (nodemailer la abre al enviar).
async function getTransporter(): Promise<Transporter | null> {
  const settings = await getPlatformSettings();
  if (!settings.smtpHost) return null;
  return nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    auth: settings.smtpUser ? { user: settings.smtpUser, pass: settings.smtpPass ?? "" } : undefined,
    // Un SMTP colgado no debe retener el request (o el job) indefinidamente.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const settings = await getPlatformSettings();
  const t = await getTransporter();
  if (!t) {
    if (process.env.NODE_ENV === "production") throw new Error("SMTP no configurado (falta el host en /plataforma)");
    console.info(`[email] (sin SMTP) Para: ${message.to} · ${message.subject}\n${message.text}`);
    return;
  }
  await t.sendMail({ from: settings.emailFrom || `${BRAND_NAME} <no-reply@${BRAND_DOMAIN}>`, ...message });
}

// Envío en segundo plano (dentro de after() de Next): un fallo del SMTP se
// registra pero no convierte en error la acción que lo originó.
export async function sendEmailSafely(message: EmailMessage, context: string): Promise<void> {
  try {
    await sendEmail(message);
  } catch (error) {
    console.error(`[email] ${context}: no se pudo enviar a ${message.to}`, error);
  }
}

// Se re-exporta por compatibilidad: la función vive en lib/app-url.ts.
export { appUrl } from "@/lib/app-url";
