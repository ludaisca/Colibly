// Definición completa de una plantilla para crearla o editarla en Meta desde la
// API pública: variables por posición o con nombre, cabecera de texto, archivo
// o ubicación, todos los botones, autenticación (OTP), oferta por tiempo
// limitado y carrusel. Puro: valida con el mensaje que vería el integrador y
// arma el payload de Meta. El formulario de la bandeja sigue en templates.ts.

export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";
export type TemplateParamExamples = string[] | Record<string, string>;

export interface TemplateButtonDef {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "COPY_CODE" | "FLOW" | "VOICE_CALL";
  text?: string;
  url?: string;
  urlExample?: string;
  phoneNumber?: string;
  /** COPY_CODE: código de ejemplo. */
  example?: string;
  flowId?: string;
  flowAction?: "navigate" | "data_exchange";
  navigateScreen?: string;
}

export interface TemplateHeaderDef {
  format: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";
  text?: string;
  exampleText?: string;
  /** Handle de Resumable Upload (la ruta sube exampleUrl antes). */
  exampleHandle?: string;
}

export interface TemplateCardDef {
  header: { format: "IMAGE" | "VIDEO"; exampleHandle?: string };
  body?: string;
  bodyExamples?: TemplateParamExamples;
  buttons: TemplateButtonDef[];
}

export interface TemplateAuthDef {
  otpType: "COPY_CODE" | "ONE_TAP" | "ZERO_TAP";
  addSecurityRecommendation?: boolean;
  codeExpirationMinutes?: number;
  buttonText?: string;
  autofillText?: string;
  packageName?: string;
  signatureHash?: string;
}

export interface TemplateComponentsDef {
  header?: TemplateHeaderDef;
  body?: string;
  bodyExamples?: TemplateParamExamples;
  footer?: string;
  buttons?: TemplateButtonDef[];
  limitedTimeOffer?: { text: string; hasExpiration: boolean };
  carousel?: TemplateCardDef[];
  authentication?: TemplateAuthDef;
}

export interface TemplateDefinition {
  name: string;
  language: string;
  category: TemplateCategory;
  components: TemplateComponentsDef;
}

export interface MetaTemplatePayload {
  name: string;
  language: string;
  category: TemplateCategory;
  parameter_format?: "NAMED";
  components: Record<string, unknown>[];
}

const NUMBERED = /\{\{\s*(\d+)\s*\}\}/g;
const NAMED = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/g;
const ANY_VAR = /\{\{[^}]*\}\}/g;

function vars(text: string | undefined) {
  const t = text ?? "";
  const named = [...new Set([...t.matchAll(NAMED)].map((m) => m[1]))];
  const numbers = [...new Set([...t.matchAll(NUMBERED)].map((m) => Number(m[1])))].sort((a, b) => a - b);
  const all = t.match(ANY_VAR)?.length ?? 0;
  const recognized = [...t.matchAll(NAMED)].length + [...t.matchAll(NUMBERED)].length;
  return { named, numbers, invalid: all !== recognized };
}

/** Error de las variables de un texto con sus ejemplos; null si está bien. */
function variablesError(where: string, text: string | undefined, examples: TemplateParamExamples | undefined): string | null {
  const v = vars(text);
  if (v.invalid) return `${where}: las variables son {{1}}, {{2}}… o {{nombre}} (minúsculas, números y _)`;
  if (v.named.length && v.numbers.length) return `${where}: no mezcles variables con nombre y por posición`;
  if (v.named.length) {
    if (!examples || Array.isArray(examples)) return `${where}: da los ejemplos como objeto { "${v.named[0]}": "…" }`;
    const missing = v.named.filter((n) => !examples[n]?.trim());
    if (missing.length) return `${where}: falta el ejemplo de ${missing.map((n) => `{{${n}}}`).join(", ")}`;
    return null;
  }
  if (v.numbers.length) {
    if (!v.numbers.every((n, i) => n === i + 1)) return `${where}: las variables deben ser {{1}}, {{2}}… seguidas y sin saltos`;
    if (!Array.isArray(examples) || examples.length !== v.numbers.length || examples.some((e) => !e?.trim())) {
      return `${where}: da un ejemplo para cada variable (${v.numbers.length} en total, como lista)`;
    }
  }
  return null;
}

function urlError(n: string, b: TemplateButtonDef): string | null {
  if (!b.url?.trim()) return `El botón ${n} necesita una URL`;
  const dynamic = b.url.includes("{{");
  const staticUrl = b.url.replace(/\{\{1\}\}$/, "");
  let base: URL;
  try {
    base = new URL(staticUrl);
    if (base.protocol !== "https:" && base.protocol !== "http:") throw new Error("protocolo");
  } catch {
    return `La URL del botón ${n} no es válida`;
  }
  if (!dynamic) return null;
  if (!/\{\{1\}\}$/.test(b.url) || (b.url.match(ANY_VAR)?.length ?? 0) !== 1) {
    return `La URL del botón ${n} admite una sola variable y al final: https://tusitio.com/{{1}}`;
  }
  if (!b.urlExample?.trim()) return `Escribe una URL de ejemplo para el botón ${n} (con la variable ya resuelta)`;
  try {
    if (new URL(b.urlExample).origin !== base.origin) throw new Error("dominio");
  } catch {
    return `El ejemplo del botón ${n} debe ser una URL del mismo dominio que la del botón`;
  }
  return null;
}

function buttonsError(where: string, buttons: TemplateButtonDef[], allowed: TemplateButtonDef["type"][]): string | null {
  const count = (t: TemplateButtonDef["type"]) => buttons.filter((b) => b.type === t).length;
  if (count("URL") > 2) return `${where}: máximo 2 botones URL`;
  if (count("PHONE_NUMBER") > 1) return `${where}: máximo 1 botón de llamada`;
  if (count("COPY_CODE") > 1) return `${where}: máximo 1 botón de copiar código`;
  if (count("FLOW") > 1) return `${where}: máximo 1 botón de Flow`;
  // Meta exige que las respuestas rápidas vayan juntas (antes o después de las demás).
  const qr = buttons.map((b) => b.type === "QUICK_REPLY");
  const firstQr = qr.indexOf(true);
  if (firstQr >= 0 && qr.slice(firstQr, qr.lastIndexOf(true) + 1).includes(false)) {
    return `${where}: las respuestas rápidas van juntas, sin otros botones en medio`;
  }
  for (const [i, b] of buttons.entries()) {
    const n = `${i + 1}`;
    if (!allowed.includes(b.type)) return `${where}: el botón ${n} (${b.type}) no se permite aquí`;
    if (b.type !== "COPY_CODE" && !b.text?.trim()) return `${where}: el botón ${n} necesita texto`;
    if ((b.text?.length ?? 0) > 25) return `${where}: el texto del botón ${n} admite máximo 25 caracteres`;
    if (b.type === "URL") {
      const e = urlError(n, b);
      if (e) return `${where}: ${e.charAt(0).toLowerCase()}${e.slice(1)}`;
    }
    if (b.type === "PHONE_NUMBER" && !/^\+?\d{8,20}$/.test(b.phoneNumber?.replace(/[\s()-]/g, "") ?? "")) {
      return `${where}: el botón ${n} necesita phoneNumber con código de país`;
    }
    if (b.type === "COPY_CODE" && !b.example?.trim()) return `${where}: el botón ${n} (copiar código) necesita example`;
    if (b.type === "FLOW") {
      if (!b.flowId || !/^\d{5,30}$/.test(b.flowId)) return `${where}: el botón ${n} necesita flowId (id numérico del Flow)`;
      if ((b.flowAction ?? "navigate") === "navigate" && !b.navigateScreen?.trim()) return `${where}: el botón ${n} (Flow con navigate) necesita navigateScreen`;
    }
  }
  return null;
}

const BUTTONS_ALL: TemplateButtonDef["type"][] = ["QUICK_REPLY", "URL", "PHONE_NUMBER", "COPY_CODE", "FLOW", "VOICE_CALL"];

/** Lo que Meta rechazaría (y tarda en decirlo). null = todo bien. Puro. */
export function templateDefinitionError(def: TemplateDefinition): string | null {
  const c = def.components;

  if (def.category === "AUTHENTICATION") {
    if (!c.authentication) return "Una plantilla AUTHENTICATION necesita components.authentication";
    if (c.header || c.body || c.footer || c.buttons?.length || c.carousel || c.limitedTimeOffer) {
      return "En AUTHENTICATION Meta fija el texto: solo se envía components.authentication";
    }
    const a = c.authentication;
    if (a.codeExpirationMinutes !== undefined && (a.codeExpirationMinutes < 1 || a.codeExpirationMinutes > 90)) {
      return "codeExpirationMinutes va de 1 a 90";
    }
    if (a.otpType !== "COPY_CODE" && (!a.packageName || !a.signatureHash)) {
      return `${a.otpType} necesita packageName y signatureHash de tu app Android`;
    }
    return null;
  }
  if (c.authentication) return "components.authentication solo va con category AUTHENTICATION";
  if (!c.body?.trim()) return "El cuerpo es requerido";

  const bodyError = variablesError("El cuerpo", c.body, c.bodyExamples);
  if (bodyError) return bodyError;

  if (c.header) {
    const h = c.header;
    if (h.format === "TEXT") {
      if (!h.text?.trim()) return "Escribe el texto de la cabecera";
      const v = vars(h.text);
      if (v.invalid || v.named.length + v.numbers.length > 1 || (v.numbers.length === 1 && v.numbers[0] !== 1)) {
        return "La cabecera de texto admite una sola variable: {{1}} o {{nombre}}";
      }
      if (v.named.length + v.numbers.length === 1 && !h.exampleText?.trim()) return "Escribe un ejemplo para la variable de la cabecera";
      const bodyNamed = vars(c.body).named.length > 0;
      if ((bodyNamed && v.numbers.length) || (!bodyNamed && vars(c.body).numbers.length && v.named.length)) {
        return "La cabecera y el cuerpo deben usar el mismo tipo de variables (con nombre o por posición)";
      }
    } else if (h.format !== "LOCATION" && !h.exampleHandle) {
      return "La cabecera multimedia necesita un archivo de ejemplo (exampleUrl)";
    }
  }

  const buttons = c.buttons ?? [];
  if (buttons.length > 10) return "Máximo 10 botones";

  if (c.carousel) {
    if (def.category !== "MARKETING") return "El carrusel solo existe en plantillas MARKETING";
    if (c.header || c.footer || buttons.length || c.limitedTimeOffer) {
      return "Un carrusel no lleva cabecera, pie ni botones fuera de las tarjetas";
    }
    if (c.carousel.length < 2 || c.carousel.length > 10) return "El carrusel lleva de 2 a 10 tarjetas";
    const first = c.carousel[0];
    for (const [i, card] of c.carousel.entries()) {
      const where = `La tarjeta ${i + 1}`;
      if (card.header.format !== first.header.format) return "Todas las tarjetas usan el mismo formato de cabecera (IMAGE o VIDEO)";
      if (!card.header.exampleHandle) return `${where} necesita su archivo de ejemplo (header.exampleUrl)`;
      if (!!card.body !== !!first.body) return "O todas las tarjetas llevan cuerpo o ninguna";
      if ((card.body?.length ?? 0) > 160) return `${where}: el cuerpo admite máximo 160 caracteres`;
      const e = variablesError(`El cuerpo de ${where.toLowerCase()}`, card.body, card.bodyExamples);
      if (e) return e;
      if (card.buttons.length < 1 || card.buttons.length > 2) return `${where} lleva 1 o 2 botones`;
      if (card.buttons.map((b) => b.type).join() !== first.buttons.map((b) => b.type).join()) {
        return "Todas las tarjetas llevan los mismos botones, en el mismo orden";
      }
      const be = buttonsError(where, card.buttons, ["QUICK_REPLY", "URL", "PHONE_NUMBER"]);
      if (be) return be;
    }
    return null;
  }

  if (c.limitedTimeOffer) {
    if (def.category !== "MARKETING") return "La oferta por tiempo limitado solo existe en plantillas MARKETING";
    if (!c.limitedTimeOffer.text.trim() || c.limitedTimeOffer.text.length > 16) return "limitedTimeOffer.text lleva de 1 a 16 caracteres";
    if (c.footer) return "Una oferta por tiempo limitado no lleva pie";
    if (c.header && c.header.format !== "IMAGE" && c.header.format !== "VIDEO") return "La cabecera de una oferta solo puede ser IMAGE o VIDEO";
    if (c.limitedTimeOffer.hasExpiration && !buttons.some((b) => b.type === "COPY_CODE")) {
      return "Una oferta con vencimiento necesita un botón COPY_CODE";
    }
    if (!buttons.some((b) => b.type === "URL")) return "Una oferta por tiempo limitado necesita un botón URL";
  }

  return buttonsError("Botones", buttons, BUTTONS_ALL);
}

function namedExamples(names: string[], examples: TemplateParamExamples | undefined) {
  const ex = (examples && !Array.isArray(examples) ? examples : {}) as Record<string, string>;
  return names.map((n) => ({ param_name: n, example: ex[n] ?? "" }));
}

function bodyComponent(text: string, examples: TemplateParamExamples | undefined): Record<string, unknown> {
  const v = vars(text);
  if (v.named.length) return { type: "BODY", text, example: { body_text_named_params: namedExamples(v.named, examples) } };
  if (v.numbers.length) return { type: "BODY", text, example: { body_text: [Array.isArray(examples) ? examples : []] } };
  return { type: "BODY", text };
}

function buttonPayload(b: TemplateButtonDef): Record<string, unknown> {
  switch (b.type) {
    case "URL":
      return b.url!.includes("{{") ? { type: "URL", text: b.text, url: b.url, example: [b.urlExample ?? ""] } : { type: "URL", text: b.text, url: b.url };
    case "PHONE_NUMBER":
      return { type: "PHONE_NUMBER", text: b.text, phone_number: b.phoneNumber!.replace(/[\s()-]/g, "") };
    case "COPY_CODE":
      return { type: "COPY_CODE", example: b.example };
    case "FLOW": {
      const action = b.flowAction ?? "navigate";
      return { type: "FLOW", text: b.text, flow_id: b.flowId, flow_action: action, ...(action === "navigate" ? { navigate_screen: b.navigateScreen } : {}) };
    }
    default:
      return { type: b.type, text: b.text };
  }
}

function authComponents(a: TemplateAuthDef): Record<string, unknown>[] {
  const button: Record<string, unknown> = { type: "OTP", otp_type: a.otpType };
  if (a.buttonText) button.text = a.buttonText;
  if (a.otpType !== "COPY_CODE") {
    button.supported_apps = [{ package_name: a.packageName, signature_hash: a.signatureHash }];
    if (a.autofillText) button.autofill_text = a.autofillText;
    if (a.otpType === "ZERO_TAP") button.zero_tap_terms_accepted = true;
  }
  const out: Record<string, unknown>[] = [{ type: "BODY", add_security_recommendation: a.addSecurityRecommendation ?? false }];
  if (a.codeExpirationMinutes) out.push({ type: "FOOTER", code_expiration_minutes: a.codeExpirationMinutes });
  out.push({ type: "BUTTONS", buttons: [button] });
  return out;
}

/** Los componentes con la forma de Meta (la misma que guarda la sincronización). Puro. */
export function buildTemplateComponents(def: Pick<TemplateDefinition, "category" | "components">): { components: Record<string, unknown>[]; named: boolean } {
  const c = def.components;
  if (def.category === "AUTHENTICATION" && c.authentication) return { components: authComponents(c.authentication), named: false };

  const out: Record<string, unknown>[] = [];
  let named = vars(c.body).named.length > 0;

  if (c.header) {
    const h = c.header;
    if (h.format === "TEXT") {
      const v = vars(h.text);
      if (v.named.length) {
        named = true;
        out.push({ type: "HEADER", format: "TEXT", text: h.text, example: { header_text_named_params: [{ param_name: v.named[0], example: h.exampleText ?? "" }] } });
      } else if (v.numbers.length) {
        out.push({ type: "HEADER", format: "TEXT", text: h.text, example: { header_text: [h.exampleText ?? ""] } });
      } else {
        out.push({ type: "HEADER", format: "TEXT", text: h.text });
      }
    } else if (h.format === "LOCATION") {
      out.push({ type: "HEADER", format: "LOCATION" });
    } else {
      out.push({ type: "HEADER", format: h.format, example: { header_handle: [h.exampleHandle ?? ""] } });
    }
  }

  out.push(bodyComponent(c.body ?? "", c.bodyExamples));

  if (c.limitedTimeOffer) {
    out.push({ type: "LIMITED_TIME_OFFER", limited_time_offer: { text: c.limitedTimeOffer.text, has_expiration: c.limitedTimeOffer.hasExpiration } });
  }
  if (c.footer) out.push({ type: "FOOTER", text: c.footer });
  if (c.buttons?.length) out.push({ type: "BUTTONS", buttons: c.buttons.map(buttonPayload) });

  if (c.carousel) {
    const cards = c.carousel.map((card) => {
      if (vars(card.body).named.length) named = true;
      const parts: Record<string, unknown>[] = [{ type: "HEADER", format: card.header.format, example: { header_handle: [card.header.exampleHandle ?? ""] } }];
      if (card.body) parts.push(bodyComponent(card.body, card.bodyExamples));
      parts.push({ type: "BUTTONS", buttons: card.buttons.map(buttonPayload) });
      return { components: parts };
    });
    out.push({ type: "CAROUSEL", cards });
  }

  return { components: out, named };
}

export function buildTemplateDefinitionPayload(def: TemplateDefinition): MetaTemplatePayload {
  const { components, named } = buildTemplateComponents(def);
  return {
    name: def.name,
    language: def.language,
    category: def.category,
    ...(named ? { parameter_format: "NAMED" as const } : {}),
    components,
  };
}
