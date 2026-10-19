import type { Metadata } from "next";
import { BRAND_CONTACT_EMAIL, BRAND_NAME } from "@/lib/brand";
import { appUrl, siteUrl } from "@/lib/app-url";
import { RETENTION_DAYS_AFTER_CANCEL, RETENTION_DAYS_AFTER_TRIAL } from "@/lib/billing/plans";
import { InfoPage, LINK } from "../_page";

const DESCRIPTION = `Cómo eliminar tu cuenta y tus datos de ${BRAND_NAME}: desde la aplicación, por correo o desde Facebook/Meta si conectaste WhatsApp con Embedded Signup.`;

export const metadata: Metadata = {
  title: "Eliminación de datos",
  description: DESCRIPTION,
  alternates: { canonical: "/eliminar-datos" },
  openGraph: { type: "website", locale: "es_MX", siteName: BRAND_NAME, url: "/eliminar-datos", title: `Eliminación de datos · ${BRAND_NAME}`, description: DESCRIPTION },
};

// Página pública de instrucciones de eliminación de datos: es la que se
// registra en Meta como "URL de instrucciones de eliminación de datos". El
// callback automático (POST /api/meta/data-deletion) y su página de estado
// (/eliminacion-de-datos/[código]) son aparte.
export default function DataDeletionPage() {
  return (
    <InfoPage
      title="Eliminación de datos"
      intro={`Puedes pedir que eliminemos tu cuenta y los datos que ${BRAND_NAME} guarda sobre ti o sobre tu negocio. Estas son las formas de hacerlo.`}
    >
      <h2>1. Desde tu cuenta (la forma más rápida)</h2>
      <p>Si eres el dueño de la cuenta, puedes eliminarlo todo tú mismo:</p>
      <ol>
        <li><a href={appUrl("/login")} className={LINK}>Entra a {BRAND_NAME}</a> con tu correo y contraseña.</li>
        <li>Ve a <strong>Configuración → Plan y facturación</strong> y baja a la sección <strong>Tus datos</strong>.</li>
        <li>Si quieres conservar una copia, pulsa <strong>Exportar</strong> antes de borrar.</li>
        <li>Pulsa <strong>Eliminar la organización</strong> y confirma. Se cancela la suscripción (si la hay) y se borran usuarios, conversaciones, contactos, bots, archivos y conexiones de canales.</li>
      </ol>

      <h2>2. Por correo</h2>
      <p>
        Escribe a <a href={`mailto:${BRAND_CONTACT_EMAIL}?subject=Eliminaci%C3%B3n%20de%20datos`} className={LINK}>{BRAND_CONTACT_EMAIL}</a> con
        el asunto &quot;Eliminación de datos&quot; e indica tu nombre, el correo de tu cuenta y el nombre de tu negocio. Para
        proteger tus datos, podemos pedirte que confirmes desde ese correo que la solicitud es tuya. Respondemos en un máximo de 20 días hábiles.
      </p>
      <p>
        Si eres cliente final de un negocio que usa {BRAND_NAME} (por ejemplo, le escribiste por WhatsApp), ese negocio es el
        responsable de tus datos: pídele a él que los elimine. Nosotros lo apoyamos para atenderlo.
      </p>

      <h2>3. Desde Facebook o Meta (conexión de WhatsApp)</h2>
      <p>
        Si conectaste tu número de WhatsApp mediante el inicio de sesión de Facebook (Embedded Signup), puedes quitar la
        aplicación de {BRAND_NAME} en <strong>Facebook → Configuración → Aplicaciones y sitios web</strong> y solicitar ahí la
        eliminación de tus datos. Meta nos avisa automáticamente, desconectamos tus cuentas de WhatsApp, borramos sus datos y te
        damos un código de confirmación. Con ese código puedes consultar el estado en{" "}
        <span className="font-mono text-sm">{siteUrl("/eliminacion-de-datos/")}&lt;código&gt;</span>. Si tus cuentas están
        en más de una organización, la revisamos manualmente para no borrar datos que no te corresponden.
      </p>

      <h2>Qué se elimina y cuánto tarda</h2>
      <ul>
        <li>Al eliminar la organización desde la cuenta, el borrado es inmediato y definitivo en la aplicación.</li>
        <li>Si cancelas, conservamos los datos {RETENTION_DAYS_AFTER_CANCEL} días en solo lectura por si decides volver y luego los eliminamos; si la prueba termina sin contratar un plan, los eliminamos a los {RETENTION_DAYS_AFTER_TRIAL} días. Si no quieres esperar, usa la opción 1 o 2.</li>
        <li>Las copias de seguridad se sobrescriben a diario, por lo que un dato eliminado puede permanecer en la copia más reciente unos pocos días.</li>
        <li>Conservamos únicamente lo que la ley nos obliga a guardar, como los registros fiscales de facturación de Stripe.</li>
      </ul>
      <p>
        Más detalle en el <a href="/privacidad" className={LINK}>Aviso de privacidad</a>. ¿Dudas? <a href="/contacto" className={LINK}>Contáctanos</a>.
      </p>
    </InfoPage>
  );
}
