import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/brand";
import { RETENTION_DAYS_AFTER_CANCEL, RETENTION_DAYS_AFTER_TRIAL } from "@/lib/billing/plans";
import { LEGAL, LegalPage } from "../_legal";

export const metadata: Metadata = { title: "Aviso de privacidad", alternates: { canonical: "/privacidad" } };

export default function PrivacyPage() {
  return (
    <LegalPage title="Aviso de privacidad">
      <p>
        {LEGAL.company} es responsable del tratamiento
        de los datos personales que recaba a través de {BRAND_NAME}, conforme a la Ley Federal de Protección de Datos
        Personales en Posesión de los Particulares y su reglamento. {BRAND_NAME} se ofrece actualmente a negocios en México. Para cualquier asunto sobre tus datos, incluido el domicilio para notificaciones, escribe a {LEGAL.email}.
      </p>

      <h2>1. Qué datos tratamos</h2>
      <ul>
        <li><strong>De los usuarios del Servicio:</strong> nombre, correo electrónico, contraseña (guardada solo de forma cifrada e irreversible), nombre del negocio y datos de uso de la cuenta.</li>
        <li><strong>De facturación:</strong> los datos de pago los recaba y guarda Stripe; nosotros solo conocemos el estado de la suscripción y los datos de la factura.</li>
        <li><strong>De los clientes de nuestros Clientes:</strong> nombres, números o identificadores de mensajería, mensajes, archivos y notas que el Cliente recibe o registra en el Servicio. Respecto de estos datos, {BRAND_NAME} actúa como encargado: los trata por cuenta y siguiendo las instrucciones del Cliente, que es su responsable. Si el Cliente conecta un número de WhatsApp que también usa en la app WhatsApp Business (coexistencia) y lo autoriza en el proceso de conexión de Meta, importamos los contactos y el historial de conversaciones que Meta nos entrega, y seguimos recibiendo los mensajes que envía desde esa app, para mostrarlos en el Servicio.</li>
      </ul>

      <h2>2. Para qué los usamos</h2>
      <p>Finalidades necesarias para prestar el Servicio:</p>
      <ul>
        <li>Crear y administrar la cuenta, autenticar a los usuarios y proteger su seguridad.</li>
        <li>Recibir, mostrar, enviar y almacenar las conversaciones de los canales que el Cliente conecta.</li>
        <li>Generar respuestas, calificaciones y resúmenes con inteligencia artificial cuando el Cliente usa esas funciones.</li>
        <li>Cobrar la suscripción y enviar avisos sobre la cuenta, la seguridad y la facturación.</li>
      </ul>
      <p>
        Finalidades secundarias: enviar novedades del producto. Puedes oponerte en cualquier momento escribiendo a{" "}
        {LEGAL.email}, sin que eso afecte el Servicio.
      </p>

      <h2>3. Con quién los compartimos</h2>
      <p>Solo con proveedores que nos ayudan a prestar el Servicio y bajo obligaciones de confidencialidad:</p>
      <ul>
        <li>Plataformas de mensajería que el Cliente conecta (Meta —WhatsApp, Instagram, Messenger— y Telegram), para enviar y recibir los mensajes.</li>
        <li>Proveedores de inteligencia artificial (OpenCode y/o Google), que procesan el texto necesario para generar cada respuesta.</li>
        <li>Stripe, para procesar los pagos.</li>
        <li>Meta y Google, para medir nuestros anuncios, solo si aceptas las cookies de medición (ver sección 7).</li>
        <li>Proveedores de almacenamiento en la nube, donde guardamos copias de seguridad de la base de datos del Servicio para poder recuperarlo ante una falla.</li>
        <li>Proveedores de infraestructura y de envío de correo. Algunos de estos proveedores tratan datos fuera de México, por ejemplo en Estados Unidos; al usar {BRAND_NAME} aceptas estas transferencias, necesarias para prestar el Servicio.</li>
      </ul>
      <p>
        Algunos de estos proveedores están fuera de tu país, por lo que puede haber transferencias internacionales de
        datos necesarias para prestar el Servicio. No vendemos datos personales.
      </p>

      <h2>4. Cuánto tiempo los conservamos</h2>
      <p>
        Mientras la cuenta esté activa. Si se cancela, conservamos los datos {RETENTION_DAYS_AFTER_CANCEL} días por si el
        Cliente vuelve y después los eliminamos; si la prueba gratuita termina sin contratar un plan, los conservamos{" "}
        {RETENTION_DAYS_AFTER_TRIAL} días y después los eliminamos. En ambos casos, salvo lo que la ley nos obligue a
        conservar (por ejemplo, información fiscal). El Cliente puede descargar o eliminar sus datos en cualquier momento
        desde su cuenta. Los archivos multimedia de las conversaciones se eliminan periódicamente según la configuración del
        Servicio. Las copias de seguridad se sobrescriben a diario: un dato eliminado puede permanecer en la copia más
        reciente hasta que esta se actualice, normalmente en un plazo de pocos días.
      </p>

      <h2>5. Cómo los protegemos</h2>
      <p>
        Cada negocio tiene su propio espacio aislado, las contraseñas y credenciales de los canales se guardan cifradas,
        y el acceso a las conversaciones se limita a los usuarios que el Cliente autoriza.
      </p>

      <h2>6. Tus derechos (ARCO)</h2>
      <p>
        Puedes acceder a tus datos, rectificarlos, cancelarlos u oponerte a su tratamiento, así como revocar tu
        consentimiento, escribiendo a {LEGAL.email} con tu nombre, el correo de tu cuenta y lo que
        solicitas. Responderemos en un máximo de 20 días hábiles. Si eres cliente de un negocio que usa {BRAND_NAME},
        dirige tu solicitud a ese negocio; nosotros lo apoyaremos para atenderla.
      </p>

      <h2 id="cookies">7. Cookies</h2>
      <p>
        Usamos cookies estrictamente necesarias para mantener tu sesión iniciada. En el sitio público, y solo si lo
        aceptas en el aviso de cookies, también usamos cookies de medición de Meta (Pixel) y Google (Analytics y
        Google Ads) para saber qué anuncios nos traen visitas y registros. Si creas una cuenta después de aceptar,
        enviamos a Meta tu correo cifrado de forma irreversible para atribuir el registro al anuncio. Puedes cambiar
        tu elección en cualquier momento desde &quot;Preferencias de cookies&quot;, al pie de la página.
      </p>

      <h2>8. Cambios a este aviso</h2>
      <p>Publicaremos cualquier cambio en esta página y, si es relevante, te avisaremos por correo.</p>
    </LegalPage>
  );
}
