import nodemailer, { type Transporter } from "nodemailer";
import { BRAND_NAME, BRAND_DOMAIN } from "@/lib/brand";
import { getPlatformSettings } from "@/lib/platform-settings";

// Envío de correo transaccional por SMTP (Resend, Brevo, SES… todos lo
// hablan). Configuración editable desde /plataforma — ver
// lib/platform-settings.ts. Sin SMTP host en /plataforma, en desarrollo se usa
// SMTP_HOST del entorno (Mailpit) y, si tampoco hay, el correo se imprime en
// el log del contenedor; en producción falta de configuración es un error,
// no un silencio — un registro cuyo correo de verificación nunca sale deja al
// cliente atorado.

export interface EmailMessage {
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string | null;
  from: string | null;
}

// SMTP vigente: el de /plataforma; si no hay y NO es producción, el de
// desarrollo por env (docker-compose.override.yml apunta SMTP_HOST/SMTP_PORT/
// EMAIL_FROM a Mailpit). Producción nunca lee estas env vars: ahí la única
// fuente es /plataforma.
export function resolveSmtpConfig(
  settings: Pick<Awaited<ReturnType<typeof getPlatformSettings>>, "smtpHost" | "smtpPort" | "smtpSecure" | "smtpUser" | "smtpPass" | "emailFrom">,
  env: Record<string, string | undefined> = process.env
): SmtpConfig | null {
  if (settings.smtpHost) {
    return { host: settings.smtpHost, port: settings.smtpPort, secure: settings.smtpSecure, user: settings.smtpUser, pass: settings.smtpPass, from: settings.emailFrom };
  }
  if (env.NODE_ENV === "production" || !env.SMTP_HOST) return null;
  const port = Number(env.SMTP_PORT) || 1025;
  return { host: env.SMTP_HOST, port, secure: port === 465, user: null, pass: null, from: env.EMAIL_FROM || null };
}

// Sin caché de instancia a propósito: la config puede cambiar desde la GUI y
// construir el transporter no abre conexión (nodemailer la abre al enviar).
async function getTransporter(): Promise<{ transporter: Transporter; from: string | null } | null> {
  const smtp = resolveSmtpConfig(await getPlatformSettings());
  if (!smtp) return null;
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass ?? "" } : undefined,
    // Un SMTP colgado no debe retener el request (o el job) indefinidamente.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return { transporter, from: smtp.from };
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const t = await getTransporter();
  if (!t) {
    if (process.env.NODE_ENV === "production") throw new Error("SMTP no configurado (falta el host en /plataforma)");
    console.info(`[email] (sin SMTP) Para: ${message.to} · ${message.subject}\n${message.text}`);
    return;
  }
  await t.transporter.sendMail({ from: t.from || `${BRAND_NAME} <no-reply@${BRAND_DOMAIN}>`, ...message });
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
