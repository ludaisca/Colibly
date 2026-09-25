import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/brand";
import { GRACE_DAYS, PLAN_LIST, RETENTION_DAYS_AFTER_CANCEL, TRIAL_DAYS } from "@/lib/billing/plans";
import { Blank, LEGAL, LegalPage } from "../_legal";

export const metadata: Metadata = { title: "Términos y condiciones" };

export default function TermsPage() {
  const prices = PLAN_LIST.map((p) => `${p.name} (${p.priceUsd} USD al mes)`).join(" y ");
  return (
    <LegalPage title="Términos y condiciones de uso">
      <p>
        Estos términos regulan el uso de {BRAND_NAME} (el &quot;Servicio&quot;), un software en línea para atender y
        gestionar conversaciones con clientes, operado por <Blank>{LEGAL.company}</Blank>, con domicilio en{" "}
        <Blank>{LEGAL.address}</Blank> (&quot;nosotros&quot;). Al crear una cuenta aceptas estos términos en nombre
        propio y del negocio que registras (el &quot;Cliente&quot;).
      </p>

      <h2>1. La cuenta</h2>
      <ul>
        <li>Debes proporcionar datos verdaderos y un correo que controles; la verificación del correo es necesaria para conectar canales y pagar.</li>
        <li>El usuario que registra la cuenta es su dueño y administrador. Es responsable de las personas que invite y de la actividad de sus usuarios.</li>
        <li>Debes mantener la confidencialidad de tus contraseñas y avisarnos de inmediato si detectas un acceso no autorizado.</li>
      </ul>

      <h2>2. Prueba gratuita</h2>
      <p>
        Cada cuenta nueva tiene {TRIAL_DAYS} días de prueba con el plan Pro, sin tarjeta. Al terminar, si no se elige un
        plan, la cuenta pasa a modo de solo lectura: los datos se conservan y los mensajes entrantes se siguen
        recibiendo, pero no se envían mensajes ni funcionan los bots, automatizaciones y campañas.
      </p>

      <h2>3. Planes, precios y pagos</h2>
      <ul>
        <li>Los planes vigentes son {prices}. Los límites de cada plan (usuarios, canales, contactos, créditos de IA y automatizaciones) se muestran en la página de precios y en la cuenta.</li>
        <li>Los precios están en dólares estadounidenses (USD) y se cobran por mes adelantado con tarjeta a través de Stripe. La suscripción se renueva automáticamente hasta que se cancele. <Blank>[Definir si los precios incluyen impuestos y cómo se facturan.]</Blank></li>
        <li>Si un cobro falla, hay {GRACE_DAYS} días de gracia con el servicio completo; después la cuenta pasa a solo lectura hasta que se regularice el pago.</li>
        <li>Podemos cambiar precios o límites avisando con al menos 30 días de anticipación; el cambio aplica a partir del siguiente periodo.</li>
        <li>Los pagos no son reembolsables salvo que la ley aplicable disponga lo contrario. <Blank>[Confirmar política de reembolsos.]</Blank></li>
      </ul>

      <h2>4. Créditos de inteligencia artificial</h2>
      <p>
        Cada plan incluye créditos mensuales de IA; cada respuesta de bot, sugerencia, calificación o paso de IA consume
        uno. Los créditos no usados no se acumulan. Las respuestas generadas por IA pueden contener errores: el Cliente
        es responsable de revisar la configuración de sus bots y de lo que comunica a sus clientes.
      </p>

      <h2>5. Canales y servicios de terceros</h2>
      <p>
        El Servicio se conecta con plataformas de terceros (WhatsApp Business de Meta, Instagram, Messenger, Telegram,
        Stripe, proveedores de IA y otros). El Cliente debe cumplir las políticas de cada plataforma —en particular la
        Política de Mensajería de WhatsApp Business y las reglas de consentimiento para mensajes de marketing—. No
        somos responsables de suspensiones, límites o cambios que esas plataformas apliquen a las cuentas del Cliente.
      </p>

      <h2>6. Uso aceptable</h2>
      <ul>
        <li>No usar el Servicio para enviar mensajes no solicitados (spam), contenido ilegal, engañoso u ofensivo, ni para suplantar a otra persona.</li>
        <li>Contar con el consentimiento de las personas a las que se envían campañas o mensajes de seguimiento, conforme a la ley aplicable.</li>
        <li>No intentar acceder a datos de otras cuentas, vulnerar la seguridad del Servicio ni usarlo para fines distintos a los de un negocio legítimo.</li>
      </ul>
      <p>Podemos suspender una cuenta que incumpla estas reglas, avisando al Cliente cuando sea posible.</p>

      <h2>7. Datos del Cliente</h2>
      <p>
        Las conversaciones, contactos y demás información que el Cliente carga o recibe en el Servicio le pertenecen. Los
        tratamos solo para prestar el Servicio, como se describe en el <a href="/privacidad" className="text-accent-ink hover:underline">Aviso de privacidad</a>.
        El Cliente es responsable de haber obtenido los permisos necesarios de sus propios clientes para tratar sus datos.
      </p>

      <h2>8. Cancelación y conservación de datos</h2>
      <p>
        El Cliente puede cancelar su suscripción en cualquier momento desde su cuenta; seguirá activa hasta el final del
        periodo pagado. Tras la cancelación, conservamos los datos {RETENTION_DAYS_AFTER_CANCEL} días en modo de solo
        lectura por si el Cliente decide volver; después se eliminan de forma definitiva.
      </p>

      <h2>9. Disponibilidad y soporte</h2>
      <p>
        Hacemos esfuerzos razonables para que el Servicio esté disponible y funcione correctamente, pero no garantizamos
        que esté libre de interrupciones o errores. <Blank>[Definir canal y horario de soporte.]</Blank>
      </p>

      <h2>10. Limitación de responsabilidad</h2>
      <p>
        En la medida permitida por la ley, nuestra responsabilidad total frente al Cliente por cualquier reclamación
        relacionada con el Servicio se limita al monto pagado por el Cliente en los 3 meses anteriores al hecho que la
        origine. No respondemos por lucro cesante, pérdida de ventas ni daños indirectos.
      </p>

      <h2>11. Propiedad intelectual</h2>
      <p>
        El software, la marca {BRAND_NAME} y el contenido del Servicio nos pertenecen. El Cliente recibe un derecho de
        uso limitado, no exclusivo e intransferible mientras su cuenta esté vigente.
      </p>

      <h2>12. Cambios a estos términos</h2>
      <p>
        Podemos actualizar estos términos. Avisaremos los cambios relevantes por correo o dentro del Servicio con al
        menos 15 días de anticipación; seguir usando el Servicio después implica su aceptación.
      </p>

      <h2>13. Ley aplicable y contacto</h2>
      <p>
        Estos términos se rigen por las leyes de <Blank>{LEGAL.jurisdiction}</Blank>, y cualquier controversia se
        someterá a sus tribunales competentes. Para cualquier duda escríbenos a <Blank>{LEGAL.email}</Blank>.
      </p>
    </LegalPage>
  );
}
