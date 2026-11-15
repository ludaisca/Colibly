import type { Metadata } from "next";
import { Mail, MessageCircle, Clock, ShieldCheck } from "lucide-react";
import { BRAND_CONTACT_EMAIL, BRAND_NAME, BRAND_SUPPORT_WHATSAPP_DISPLAY, BRAND_SUPPORT_WHATSAPP_URL } from "@/lib/brand";
import { appUrl } from "@/lib/app-url";
import { InfoPage, LINK } from "../_page";

const DESCRIPTION = `Contacto y soporte de ${BRAND_NAME}: escríbenos por WhatsApp o por correo para resolver dudas sobre tu cuenta, la conexión de WhatsApp, los planes o tus datos.`;

export const metadata: Metadata = {
  title: "Contacto y soporte",
  description: DESCRIPTION,
  alternates: { canonical: "/contacto" },
  openGraph: { type: "website", locale: "es_MX", siteName: BRAND_NAME, url: "/contacto", title: `Contacto y soporte · ${BRAND_NAME}`, description: DESCRIPTION },
};

export default function ContactPage() {
  return (
    <InfoPage title="Contacto y soporte" intro="¿Dudas sobre tu cuenta, la conexión de WhatsApp, los planes o tus datos? Escríbenos y una persona te responde.">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5">
          <Mail size={20} className="text-accent-ink" aria-hidden />
          <h2 className="!mt-3 !text-base">Correo</h2>
          <p className="mt-1">
            <a href={`mailto:${BRAND_CONTACT_EMAIL}`} className={`${LINK} font-medium`}>{BRAND_CONTACT_EMAIL}</a>
          </p>
          <p className="mt-1 text-sm text-muted">Es el canal para soporte, ventas, facturación y solicitudes sobre tus datos personales.</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <MessageCircle size={20} className="text-accent-ink" aria-hidden />
          <h2 className="!mt-3 !text-base">WhatsApp</h2>
          <p className="mt-1">
            <a href={BRAND_SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className={`${LINK} font-medium`}>{BRAND_SUPPORT_WHATSAPP_DISPLAY}</a>
          </p>
          <p className="mt-1 text-sm text-muted">Es el canal para hablar con una persona del equipo sobre tu cuenta o la conexión de WhatsApp.</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <Clock size={20} className="text-accent-ink" aria-hidden />
          <h2 className="!mt-3 !text-base">Horario de atención</h2>
          <p className="mt-1">Lunes a viernes, en horario laboral de México.</p>
          <p className="mt-1 text-sm text-muted">Respondemos tan pronto como nos es posible, normalmente en uno o dos días hábiles.</p>
        </div>
      </div>

      <h2>Para ayudarte más rápido, incluye en tu mensaje</h2>
      <ul>
        <li>El correo con el que creaste tu cuenta y el nombre de tu negocio.</li>
        <li>Qué intentabas hacer y qué pasó (si puedes, una captura de pantalla).</li>
        <li>Si el problema es con WhatsApp, el número que intentas conectar.</li>
      </ul>

      <div className="flex gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-foreground" aria-hidden />
        <p className="min-w-0 text-pretty">Nunca te pediremos tu contraseña, códigos de verificación ni tokens por correo o chat. Si alguien lo hace en nombre de {BRAND_NAME}, no lo compartas y avísanos.</p>
      </div>

      <h2>Otros enlaces útiles</h2>
      <ul>
        <li><a href="/precios" className={LINK}>Planes y precios</a></li>
        <li><a href="/eliminar-datos" className={LINK}>Cómo eliminar tus datos</a></li>
        <li><a href="/privacidad" className={LINK}>Aviso de privacidad</a> y <a href="/terminos" className={LINK}>Términos y condiciones</a></li>
        <li><a href={appUrl("/login")} className={LINK}>Entrar a tu cuenta</a> · <a href={appUrl("/recuperar")} className={LINK}>Recuperar mi contraseña</a></li>
      </ul>
    </InfoPage>
  );
}
