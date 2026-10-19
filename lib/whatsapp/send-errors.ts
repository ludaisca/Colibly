// Códigos con que Meta rechaza un envío (respuesta síncrona de Graph o webhook
// de estado "failed") → texto en español para la bandeja. Solo los conocidos;
// el resto conserva el detalle de Meta. Referencia:
// https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
const MESSAGES: Record<number, string> = {
  131047: "Pasaron más de 24 h desde el último mensaje del cliente: solo puedes enviarle una plantilla aprobada.",
  141006: "Meta rechazó el envío por un problema con el método de pago de la cuenta de WhatsApp Business. Revísalo en el Administrador comercial de Meta.",
  131042: "Meta rechazó el envío por un problema con el método de pago de la cuenta de WhatsApp Business. Revísalo en el Administrador comercial de Meta.",
  131026: "No se pudo entregar: el número no tiene WhatsApp o no aceptó las condiciones más recientes.",
  131049: "Meta no entregó este mensaje para cuidar la experiencia del cliente (límite de mensajes de marketing). Inténtalo más tarde.",
  131050: "El cliente pidió dejar de recibir mensajes de marketing de tu negocio.",
  131051: "WhatsApp no admite este tipo de mensaje.",
  131053: "No se pudo subir el archivo adjunto a WhatsApp.",
  131056: "Demasiados mensajes seguidos a este número. Espera un momento antes de volver a intentarlo.",
  131000: "WhatsApp tuvo un error al enviar el mensaje. Inténtalo de nuevo.",
  131005: "La cuenta de WhatsApp no tiene permiso para enviar este mensaje.",
  131008: "Falta un dato obligatorio en el mensaje.",
  131009: "Uno de los datos del mensaje no es válido.",
  131021: "No puedes enviarte mensajes a tu propio número.",
  132000: "El número de variables no coincide con la plantilla aprobada.",
  132001: "La plantilla no existe en ese idioma o todavía no está aprobada.",
  132005: "El texto de la plantilla con las variables es demasiado largo.",
  132007: "El contenido de la plantilla infringe las políticas de WhatsApp.",
  132012: "Las variables no tienen el formato que espera la plantilla.",
  132015: "La plantilla está pausada por baja calidad.",
  132016: "La plantilla está desactivada por baja calidad.",
  368: "La cuenta de WhatsApp está restringida temporalmente por infringir las políticas de Meta.",
  470: "Pasaron más de 24 h desde el último mensaje del cliente: solo puedes enviarle una plantilla aprobada.",
};

export function metaSendErrorMessage(code: number | null | undefined, fallback?: string | null): string {
  if (code != null && MESSAGES[code]) return MESSAGES[code];
  if (code != null && code >= 132000 && code < 133000) return "Meta rechazó la plantilla. Revisa que siga aprobada y que las variables sean correctas.";
  return fallback?.trim() || "WhatsApp no pudo enviar el mensaje.";
}

// Error de Graph con su código, para que quien llame pueda traducirlo.
export class MetaSendError extends Error {
  constructor(message: string, public readonly metaCode: number | null) {
    super(message);
    this.name = "MetaSendError";
  }
}
