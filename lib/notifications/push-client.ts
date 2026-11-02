// Lado navegador de las notificaciones push (sin React: lo usan el menú de
// usuario y los botones de "Cerrar sesión"). Ver lib/notifications/push.ts.

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** iPhone/iPad solo permiten push con la app agregada a la pantalla de inicio. */
export function needsHomeScreenInstall(): boolean {
  if (typeof window === "undefined") return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const left = new Uint8Array(a);
  return left.length === b.length && left.every((value, index) => value === b[index]);
}

async function postSubscription(subscription: PushSubscription): Promise<void> {
  const res = await fetch("/api/usuarios/me/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!res.ok) throw new Error("No se pudo activar en el servidor");
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

// El navegador responde en inglés; se traduce por `name`, que sí es estable.
function subscribeErrorMessage(error: unknown): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (name === "NotAllowedError") return "El navegador bloqueó las notificaciones de este sitio. Permítelas en el candado de la barra de direcciones.";
  if (name === "InvalidAccessError") return "La llave de notificaciones no es válida. Pide al operador que la regenere en Plataforma → Configuración.";
  if (name === "AbortError") {
    return "El servicio de notificaciones del navegador no respondió. En Brave activa «Usar servicios de Google para mensajería push» en brave://settings/privacy; en otros navegadores revisa que no estés en modo incógnito ni bloqueando el acceso a Google.";
  }
  return `El navegador no permitió activar los avisos${name ? ` (${name})` : ""}. Revisa que no estés en modo incógnito y que las notificaciones estén permitidas.`;
}

/**
 * Activa los avisos en este navegador. Si la suscripción existente se hizo con
 * otras llaves (la plataforma las regeneró), se rehace.
 */
export async function enablePush(publicKey: string): Promise<void> {
  if (!pushSupported()) throw new Error("Este navegador no admite notificaciones");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permiso denegado: actívalo en la configuración del navegador");
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const key = urlBase64ToUint8Array(publicKey);
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    } catch (error) {
      console.error("[push] pushManager.subscribe falló", error);
      throw new Error(subscribeErrorMessage(error));
    }
  }
  await postSubscription(subscription);
}

/**
 * Re-sincroniza al cargar la app: si el navegador ya tiene permiso y
 * suscripción (p. ej. otro usuario inició sesión en él), la registra para el
 * usuario actual. Devuelve si quedó activa.
 */
export async function syncPush(publicKey: string): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const subscription = await currentSubscription();
  if (!subscription) return false;
  if (!sameKey(subscription.options.applicationServerKey, urlBase64ToUint8Array(publicKey))) return false;
  await postSubscription(subscription);
  return true;
}

/** Desactiva en este navegador (y en el servidor). Nunca lanza: se usa al cerrar sesión. */
export async function disablePush(): Promise<void> {
  try {
    const subscription = await currentSubscription();
    if (!subscription) return;
    await fetch("/api/usuarios/me/push", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => {});
    await subscription.unsubscribe();
  } catch {
    // Sin suscripción o sin soporte: nada que limpiar.
  }
}
