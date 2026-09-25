import nodemailer, { type Transporter } from "nodemailer";

// Envío de correo transaccional por SMTP (Resend, Brevo, SES… todos lo
// hablan). Sin SMTP_HOST, en desarrollo el correo se imprime en el log del
// contenedor; en producción falta de configuración es un error, no un silencio
// — un registro cuyo correo de verificación nunca sale deja al cliente atorado.

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  const host = process.env.SMTP_HOST;
  if (!host) {
    transporter = null;
    return null;
  }
  const user = process.env.SMTP_USER;
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: user ? { user, pass: process.env.SMTP_PASS ?? "" } : undefined,
    // Un SMTP colgado no debe retener el request (o el job) indefinidamente.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const t = getTransporter();
  if (!t) {
    if (process.env.NODE_ENV === "production") throw new Error("SMTP no configurado (SMTP_HOST)");
    console.info(`[email] (sin SMTP) Para: ${message.to} · ${message.subject}\n${message.text}`);
    return;
  }
  await t.sendMail({ from: process.env.EMAIL_FROM || "SunflowCRM <no-reply@localhost>", ...message });
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
