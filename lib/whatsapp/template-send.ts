// Arma los `components` de un envío type:"template" a partir de la plantilla
// guardada (forma de Meta: HEADER, BODY, FOOTER, BUTTONS, LIMITED_TIME_OFFER,
// CAROUSEL) y de lo que manda quien envía. Puro: valida y responde con el
// mensaje que vería el integrador, sin llamar a Meta.
//
// Cubre lo que Meta admite al enviar: variables por posición ({{1}}) o con
// nombre ({{nombre}}), cabecera de texto, archivo (URL o media id) o ubicación,
// botones URL dinámicos, respuesta rápida con payload, copiar código, Flow,
// códigos de autenticación (OTP), oferta por tiempo limitado y carrusel.

export class TemplateParamsError extends Error {}

export type TemplateParamValues = string[] | Record<string, string>;

export interface TemplateButtonParam {
  /** Posición del botón en la plantilla (0 = primero). */
  index: number;
  /** Respuesta rápida: lo que llega en el webhook cuando el cliente lo toca. */
  payload?: string;
  /** Botón URL dinámico: el final de la URL ({{1}}). */
  urlParam?: string;
  /** Botón copiar código. */
  couponCode?: string;
  /** Botón de Flow. */
  flowToken?: string;
  flowData?: Record<string, unknown>;
}

export interface TemplateLocation {
  latitude: number;
  longitude: number;
  name?: string | null;
  address?: string | null;
}

export interface TemplateCardParams {
  /** Imagen o video de la tarjeta: URL https o media id de Meta. */
  headerParam?: string | null;
  bodyParams?: TemplateParamValues;
  buttons?: TemplateButtonParam[];
}

export interface TemplateSendInput {
  bodyParams?: TemplateParamValues;
  /** Cabecera: texto de la variable, o URL https / media id del archivo. */
  headerParam?: string | null;
  headerLocation?: TemplateLocation | null;
  /** Atajo: el final del primer botón URL dinámico. */
  buttonParam?: string | null;
  buttons?: TemplateButtonParam[];
  /** Plantillas de autenticación: el código (va en el cuerpo y en el botón). */
  code?: string | null;
  /** Oferta por tiempo limitado con vencimiento (ISO 8601). */
  offerExpiresAt?: string | null;
  cards?: TemplateCardParams[];
}

export interface BuiltTemplateSend {
  components: Record<string, unknown>[];
  /** Texto que leerá el cliente (cabecera + cuerpo con las variables puestas). */
  text: string;
}

interface StoredButton {
  type?: string;
  text?: string;
  url?: string;
}

interface StoredComponent {
  type?: string;
  format?: string;
  text?: string;
  buttons?: StoredButton[];
  limited_time_offer?: { text?: string; has_expiration?: boolean };
  cards?: Array<{ components?: StoredComponent[] }>;
}

const NUMBERED = /\{\{\s*(\d+)\s*\}\}/g;
const NAMED = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/g;
const MEDIA_FORMATS = new Set(["IMAGE", "VIDEO", "DOCUMENT"]);

/** Variables de un texto: con nombre (en orden de aparición) o cuántas por posición. */
export function templateTextVariables(text: string | undefined): { named: string[]; count: number } {
  const t = text ?? "";
  const named = [...new Set([...t.matchAll(NAMED)].map((m) => m[1]))];
  const count = new Set([...t.matchAll(NUMBERED)].map((m) => m[1])).size;
  return { named, count };
}

function list(components: unknown): StoredComponent[] {
  return Array.isArray(components) ? (components as StoredComponent[]) : [];
}

function find(components: StoredComponent[], type: string): StoredComponent | undefined {
  return components.find((c) => c.type?.toUpperCase() === type);
}

function substitute(text: string, values: TemplateParamValues | undefined): string {
  if (!values) return text;
  if (Array.isArray(values)) return text.replace(NUMBERED, (m, n) => values[Number(n) - 1] ?? m);
  return text.replace(NAMED, (m, name) => values[name] ?? m);
}

function textParameters(where: string, text: string | undefined, values: TemplateParamValues | undefined): Record<string, unknown>[] {
  const { named, count } = templateTextVariables(text);
  if (named.length > 0) {
    if (!values || Array.isArray(values)) {
      throw new TemplateParamsError(`${where} usa variables con nombre (${named.join(", ")}): envía un objeto { "${named[0]}": "…" }`);
    }
    const missing = named.filter((n) => !values[n]?.trim());
    if (missing.length) throw new TemplateParamsError(`Falta el valor de ${missing.map((n) => `{{${n}}}`).join(", ")} en ${where}`);
    return named.map((n) => ({ type: "text", parameter_name: n, text: values[n] }));
  }
  if (count === 0) return [];
  if (!Array.isArray(values)) {
    throw new TemplateParamsError(`${where} usa variables por posición ({{1}}…): envía una lista con ${count} valor(es)`);
  }
  if (values.length < count || values.slice(0, count).some((v) => !v?.trim())) {
    throw new TemplateParamsError(`${where} requiere ${count} parámetro(s)`);
  }
  return values.slice(0, count).map((text) => ({ type: "text", text }));
}

function mediaParameter(format: string, value: string): Record<string, unknown> {
  const type = format.toLowerCase();
  // URL https pública o el id de un archivo ya subido a Meta (POST /media).
  return { type, [type]: /^https:\/\//i.test(value) ? { link: value } : { id: value } };
}

function headerComponent(
  header: StoredComponent | undefined,
  where: string,
  param: string | null | undefined,
  location: TemplateLocation | null | undefined
): Record<string, unknown> | null {
  if (!header) {
    if (param || location) throw new TemplateParamsError(`${where} no tiene cabecera`);
    return null;
  }
  const format = header.format?.toUpperCase() ?? "TEXT";
  if (format === "TEXT") {
    const { named, count } = templateTextVariables(header.text);
    if (!named.length && !count) return null;
    if (!param?.trim()) throw new TemplateParamsError(`${where} requiere headerParam (la variable de la cabecera)`);
    return { type: "header", parameters: [named.length ? { type: "text", parameter_name: named[0], text: param } : { type: "text", text: param }] };
  }
  if (format === "LOCATION") {
    if (!location) throw new TemplateParamsError(`${where} tiene cabecera de ubicación: envía headerLocation`);
    const loc: Record<string, unknown> = { latitude: location.latitude, longitude: location.longitude };
    if (location.name) loc.name = location.name;
    if (location.address) loc.address = location.address;
    return { type: "header", parameters: [{ type: "location", location: loc }] };
  }
  if (MEDIA_FORMATS.has(format)) {
    if (!param?.trim()) throw new TemplateParamsError(`${where} requiere headerParam: la URL https o el media id del archivo (${format})`);
    return { type: "header", parameters: [mediaParameter(format, param.trim())] };
  }
  throw new TemplateParamsError(`${where}: cabecera ${format} no soportada`);
}

interface ButtonContext {
  where: string;
  buttonParam?: string | null;
  code?: string | null;
}

function buttonComponents(stored: StoredButton[] | undefined, given: TemplateButtonParam[] | undefined, ctx: ButtonContext): Record<string, unknown>[] {
  const buttons = stored ?? [];
  const byIndex = new Map<number, TemplateButtonParam>();
  for (const b of given ?? []) {
    if (b.index < 0 || b.index >= buttons.length) throw new TemplateParamsError(`${ctx.where} no tiene botón en el índice ${b.index}`);
    if (byIndex.has(b.index)) throw new TemplateParamsError(`${ctx.where}: el botón ${b.index} viene repetido`);
    byIndex.set(b.index, b);
  }

  let legacyUsed = false;
  const out: Record<string, unknown>[] = [];
  buttons.forEach((button, index) => {
    const type = button.type?.toUpperCase();
    const g = byIndex.get(index);
    const wrongField = (allowed: (keyof TemplateButtonParam)[]) => {
      const extra = (["payload", "urlParam", "couponCode", "flowToken", "flowData"] as const).filter((k) => g?.[k] !== undefined && !allowed.includes(k));
      if (extra.length) throw new TemplateParamsError(`${ctx.where}: el botón ${index} (${type}) no lleva ${extra.join(", ")}`);
    };
    const component = (subType: string, parameters: Record<string, unknown>[]) => ({ type: "button", sub_type: subType, index: String(index), parameters });

    switch (type) {
      case "URL": {
        wrongField(["urlParam"]);
        const dynamic = /\{\{.+\}\}/.test(button.url ?? "");
        if (!dynamic) {
          if (g?.urlParam) throw new TemplateParamsError(`${ctx.where}: el botón ${index} tiene una URL fija`);
          return;
        }
        let value = g?.urlParam;
        if (!value && ctx.buttonParam && !legacyUsed) {
          value = ctx.buttonParam;
          legacyUsed = true;
        }
        if (!value?.trim()) throw new TemplateParamsError(`${ctx.where}: el botón ${index} requiere urlParam (el final de la URL)`);
        out.push(component("url", [{ type: "text", text: value }]));
        return;
      }
      case "OTP": {
        wrongField([]);
        if (!ctx.code?.trim()) throw new TemplateParamsError("La plantilla de autenticación requiere code");
        out.push(component("url", [{ type: "text", text: ctx.code }]));
        return;
      }
      case "COPY_CODE": {
        wrongField(["couponCode"]);
        if (!g?.couponCode?.trim()) throw new TemplateParamsError(`${ctx.where}: el botón ${index} (copiar código) requiere couponCode`);
        out.push(component("copy_code", [{ type: "coupon_code", coupon_code: g.couponCode }]));
        return;
      }
      case "QUICK_REPLY": {
        wrongField(["payload"]);
        // Sin payload, Meta devuelve el texto del botón al tocarlo.
        if (g?.payload) out.push(component("quick_reply", [{ type: "payload", payload: g.payload }]));
        return;
      }
      case "FLOW": {
        wrongField(["flowToken", "flowData"]);
        if (g?.flowToken || g?.flowData) {
          const action: Record<string, unknown> = {};
          if (g.flowToken) action.flow_token = g.flowToken;
          if (g.flowData) action.flow_action_data = g.flowData;
          out.push(component("flow", [{ type: "action", action }]));
        }
        return;
      }
      case "MPM":
        throw new TemplateParamsError(`${ctx.where}: los botones de varios productos (MPM) no se pueden enviar por la API todavía`);
      default:
        // PHONE_NUMBER, VOICE_CALL, CATALOG…: no llevan parámetros.
        wrongField([]);
    }
  });
  return out;
}

/**
 * Componentes del envío para la plantilla guardada. Lanza TemplateParamsError
 * con un mensaje para el integrador si falta o sobra algo.
 */
export function buildTemplateSend(storedComponents: unknown, category: string | null | undefined, input: TemplateSendInput): BuiltTemplateSend {
  const components = list(storedComponents);
  const header = find(components, "HEADER");
  const body = find(components, "BODY");
  const buttons = find(components, "BUTTONS");
  const offer = find(components, "LIMITED_TIME_OFFER");
  const carousel = find(components, "CAROUSEL");
  const isAuth = category?.toUpperCase() === "AUTHENTICATION";
  const where = "La plantilla";
  const out: Record<string, unknown>[] = [];

  const h = headerComponent(header, where, input.headerParam, input.headerLocation);
  if (h) out.push(h);

  let bodyValues = input.bodyParams;
  if (isAuth) {
    if (!input.code?.trim()) throw new TemplateParamsError("La plantilla de autenticación requiere code (el código a enviar)");
    bodyValues = [input.code];
  }
  const bodyParams = textParameters("El cuerpo", body?.text, bodyValues);
  if (bodyParams.length) out.push({ type: "body", parameters: bodyParams });

  if (offer?.limited_time_offer?.has_expiration) {
    const at = input.offerExpiresAt ? new Date(input.offerExpiresAt).getTime() : NaN;
    if (!Number.isFinite(at)) throw new TemplateParamsError("La oferta por tiempo limitado requiere offerExpiresAt (fecha ISO 8601)");
    if (at <= Date.now()) throw new TemplateParamsError("offerExpiresAt ya pasó");
    out.push({ type: "limited_time_offer", parameters: [{ type: "limited_time_offer", limited_time_offer: { expiration_time_ms: at } }] });
  } else if (input.offerExpiresAt) {
    throw new TemplateParamsError("offerExpiresAt solo va con plantillas de oferta con vencimiento");
  }

  if (carousel) {
    const storedCards = carousel.cards ?? [];
    const cards = input.cards ?? [];
    if (cards.length !== storedCards.length) {
      throw new TemplateParamsError(`La plantilla es un carrusel de ${storedCards.length} tarjetas: envía cards con ${storedCards.length} elementos`);
    }
    const builtCards = storedCards.map((card, i) => {
      const cc = list(card.components);
      const cardWhere = `La tarjeta ${i}`;
      const parts: Record<string, unknown>[] = [];
      const ch = headerComponent(find(cc, "HEADER"), cardWhere, cards[i].headerParam, null);
      if (ch) parts.push(ch);
      const cb = textParameters(`El cuerpo de la tarjeta ${i}`, find(cc, "BODY")?.text, cards[i].bodyParams);
      if (cb.length) parts.push({ type: "body", parameters: cb });
      parts.push(...buttonComponents(find(cc, "BUTTONS")?.buttons, cards[i].buttons, { where: cardWhere }));
      return { card_index: i, components: parts };
    });
    out.push({ type: "carousel", cards: builtCards });
  } else if (input.cards?.length) {
    throw new TemplateParamsError("cards solo va con plantillas de carrusel");
  }

  out.push(...buttonComponents(buttons?.buttons, input.buttons, { where, buttonParam: input.buttonParam, code: input.code }));

  const text = [
    (header?.format ?? "TEXT").toUpperCase() === "TEXT" && header?.text ? substitute(header.text, headerValues(header.text, input.headerParam)) : "",
    body?.text ? substitute(body.text, bodyValues) : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  return { components: out, text };
}

function headerValues(text: string, value: string | null | undefined): TemplateParamValues | undefined {
  if (!value) return undefined;
  const name = templateTextVariables(text).named[0];
  return name ? { [name]: value } : [value];
}

export interface TemplateSendShape {
  parameterFormat: "NAMED" | "POSITIONAL";
  /** Nombres de las variables del cuerpo (NAMED) o cuántas son (POSITIONAL). */
  bodyParams: string[] | number;
  header: { format: string; required: boolean } | null;
  buttons: Array<{ index: number; type: string; text: string | null; param: "urlParam" | "couponCode" | "payload" | "flowToken" | "code" | null; required: boolean }>;
  requiresCode: boolean;
  offer: { hasExpiration: boolean } | null;
  carouselCards: number | null;
}

/** Qué pide la plantilla al enviarla (GET /templates). Puro. */
export function describeTemplateSend(storedComponents: unknown, category: string | null | undefined): TemplateSendShape {
  const components = list(storedComponents);
  const header = find(components, "HEADER");
  const bodyVars = templateTextVariables(find(components, "BODY")?.text);
  const offer = find(components, "LIMITED_TIME_OFFER");
  const carousel = find(components, "CAROUSEL");
  const format = header ? header.format?.toUpperCase() ?? "TEXT" : null;
  const headerVars = templateTextVariables(header?.text);
  const isAuth = category?.toUpperCase() === "AUTHENTICATION";

  return {
    parameterFormat: bodyVars.named.length || headerVars.named.length ? "NAMED" : "POSITIONAL",
    bodyParams: isAuth ? 0 : bodyVars.named.length ? bodyVars.named : bodyVars.count,
    header: format ? { format, required: format === "TEXT" ? headerVars.named.length + headerVars.count > 0 : true } : null,
    buttons: (find(components, "BUTTONS")?.buttons ?? []).map((b, index) => {
      const type = b.type?.toUpperCase() ?? "";
      const dynamicUrl = type === "URL" && /\{\{.+\}\}/.test(b.url ?? "");
      const param = type === "OTP" ? "code" : dynamicUrl ? "urlParam" : type === "COPY_CODE" ? "couponCode" : type === "QUICK_REPLY" ? "payload" : type === "FLOW" ? "flowToken" : null;
      return { index, type, text: b.text ?? null, param, required: param === "urlParam" || param === "couponCode" || param === "code" } as TemplateSendShape["buttons"][number];
    }),
    requiresCode: isAuth,
    offer: offer ? { hasExpiration: !!offer.limited_time_offer?.has_expiration } : null,
    carouselCards: carousel ? (carousel.cards ?? []).length : null,
  };
}
