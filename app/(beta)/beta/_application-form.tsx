"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { FormField } from "@/app/components/ui/form-field";
import { Banner } from "@/app/components/ui/banner";
import { betaApplicationSchema } from "@/lib/beta-application";
import { track } from "@/lib/analytics/client";
import { BRAND_CONTACT_EMAIL } from "@/lib/brand";

type Fields = "name" | "businessName" | "email" | "phone" | "description" | "privacyAccepted";
type TextFields = Exclude<Fields, "privacyAccepted">;

// Borrador por pestaña: sobrevive a un refresco o a abrir el aviso de privacidad,
// y se borra al enviar. No guarda la casilla de consentimiento ni el campo trampa.
const DRAFT_KEY = "colibly_beta_draft";
const TEXT_FIELDS: TextFields[] = ["name", "businessName", "email", "phone", "description"];
const DESCRIPTION_MAX = 400;
const SUBMIT_TIMEOUT_MS = 20_000;

export function BetaApplicationForm() {
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Fields, string>>>({});
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const successRef = useRef<HTMLHeadingElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const businessRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const privacyRef = useRef<HTMLInputElement>(null);
  const draft = useRef<Partial<Record<TextFields, string>>>({});

  const setters: Record<TextFields, (value: string) => void> = {
    name: setName,
    businessName: setBusinessName,
    email: setEmail,
    phone: setPhone,
    description: setDescription,
  };

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null") as Partial<Record<TextFields, unknown>> | null;
      if (!saved || typeof saved !== "object") return;
      for (const field of TEXT_FIELDS) {
        const value = saved[field];
        if (typeof value === "string" && value) {
          draft.current[field] = value;
          setters[field](value);
        }
      }
    } catch {
      // Sin sessionStorage (modo privado, datos bloqueados): el formulario funciona igual, sin borrador.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function remember(field: TextFields, value: string) {
    draft.current[field] = value;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft.current));
    } catch {}
  }

  function forgetDraft() {
    draft.current = {};
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {}
  }

  function checkField(field: TextFields, value: string) {
    const result = betaApplicationSchema.shape[field].safeParse(value);
    setErrors((prev) => {
      const next = { ...prev };
      if (result.success) delete next[field];
      else next[field] = result.error.issues[0]?.message ?? "Revisa este campo";
      return next;
    });
  }

  // Un campo vacío no se marca al pasar por él con el tabulador (eso se avisa al enviar);
  // uno con contenido se revisa al salir, y un error visible se corrige en vivo.
  function fieldProps(field: TextFields, value: string) {
    return {
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setters[field](e.target.value);
        remember(field, e.target.value);
        if (errors[field]) checkField(field, e.target.value);
      },
      onBlur: () => {
        if (value.trim()) checkField(field, value);
      },
    };
  }

  function showServerError(message: string) {
    setServerError(message);
    requestAnimationFrame(() => bannerRef.current?.scrollIntoView({ block: "nearest" }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setServerError("");
    setErrors({});
    const parsed = betaApplicationSchema.safeParse({ name, businessName, email, phone, description, privacyAccepted, website });
    if (!parsed.success) {
      const next: Partial<Record<Fields, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Fields;
        if (!next[field]) next[field] = issue.message;
      }
      setErrors(next);
      const first = (["name", "businessName", "email", "phone", "description", "privacyAccepted"] as const).find((field) => next[field]);
      const refs = { name: nameRef, businessName: businessRef, email: emailRef, phone: phoneRef, description: descriptionRef, privacyAccepted: privacyRef };
      if (first) requestAnimationFrame(() => refs[first].current?.focus());
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/beta/solicitudes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
        signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
      });
      // Un 502 o una página de error del proxy no traen JSON: no mostrar el SyntaxError del navegador.
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        showServerError(typeof result?.error === "string" ? result.error : "No pudimos enviar tu solicitud.");
        return;
      }
      forgetDraft();
      setSent(true);
      track({ name: "beta_apply" });
      requestAnimationFrame(() => successRef.current?.focus());
    } catch (error) {
      // fetch lanza en inglés ("Failed to fetch", "Load failed") sin conexión o al agotar el tiempo.
      const timedOut = error instanceof DOMException && error.name === "TimeoutError";
      showServerError(timedOut
        ? "La solicitud tardó demasiado. Revisa tu conexión e inténtalo de nuevo; lo que escribiste sigue aquí."
        : "No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo; lo que escribiste sigue aquí.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-[20px] border border-success-border bg-success-bg p-7 text-center shadow-sm sm:p-10" role="status">
        <CheckCircle2 className="mx-auto text-success" size={40} aria-hidden />
        <h2 ref={successRef} tabIndex={-1} className="mt-4 font-display text-2xl font-semibold text-foreground focus:outline-none">Recibimos tu solicitud</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">Revisaremos si la beta encaja con tu negocio y te responderemos por correo a <span className="font-medium text-foreground">{email.trim()}</span>. Si necesitas añadir algo, escríbenos a <a href={`mailto:${BRAND_CONTACT_EMAIL}`} className="font-medium text-accent-ink underline">{BRAND_CONTACT_EMAIL}</a>.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="rounded-[20px] bg-surface p-5 shadow-lg sm:p-7">
      <div className="mb-6">
        <h3 className="font-display text-2xl font-semibold text-foreground">Cuéntanos de tu negocio</h3>
        <p className="mt-2 text-sm text-muted">Son datos de contacto y una pregunta opcional. La configuración la vemos contigo después.</p>
      </div>
      {serverError && (
        <div ref={bannerRef} className="mb-5 scroll-mt-24">
          <Banner tone="danger">{serverError} <a href={`mailto:${BRAND_CONTACT_EMAIL}`} className="underline">También puedes escribirnos.</a></Banner>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Tu nombre" required error={errors.name}>
          {(id, describedBy) => <Input ref={nameRef} id={id} aria-describedby={describedBy} autoComplete="name" maxLength={80} placeholder="Ana López" error={errors.name} inputClassName="max-sm:text-base" {...fieldProps("name", name)} />}
        </FormField>
        <FormField label="Nombre de tu negocio" required error={errors.businessName}>
          {(id, describedBy) => <Input ref={businessRef} id={id} aria-describedby={describedBy} autoComplete="organization" maxLength={100} placeholder="Estudio Aurora" error={errors.businessName} inputClassName="max-sm:text-base" {...fieldProps("businessName", businessName)} />}
        </FormField>
        <FormField label="Correo donde te escribimos" required error={errors.email}>
          {(id, describedBy) => <Input ref={emailRef} id={id} aria-describedby={describedBy} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} placeholder="ana@negocio.com" error={errors.email} inputClassName="max-sm:text-base" {...fieldProps("email", email)} />}
        </FormField>
        <FormField label="WhatsApp de contacto" required error={errors.phone} hint="Incluye la lada; acepta números de 8 a 15 dígitos.">
          {(id, describedBy) => <Input ref={phoneRef} id={id} aria-describedby={describedBy} type="tel" inputMode="tel" autoComplete="tel" maxLength={30} placeholder="+52 55 1234 5678" error={errors.phone} inputClassName="max-sm:text-base" {...fieldProps("phone", phone)} />}
        </FormField>
      </div>
      <FormField label="¿Cómo atiendes hoy los mensajes de tus clientes?" hint="Opcional. Con una frase basta." error={errors.description} className="mt-4">
        {(id, describedBy) => <Textarea ref={descriptionRef} id={id} aria-describedby={describedBy} maxLength={DESCRIPTION_MAX} placeholder="Somos dos personas y atendemos desde un solo celular…" error={errors.description} className="max-sm:[&_textarea]:text-base" {...fieldProps("description", description)} />}
      </FormField>
      <div className="absolute -left-[10000px]" aria-hidden="true">
        <label htmlFor="beta-website">Sitio web</label>
        <input id="beta-website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      <div className="mt-5">
        <label className="flex items-start gap-3 text-sm leading-6 text-muted">
          <input ref={privacyRef} type="checkbox" checked={privacyAccepted} onChange={(e) => { setPrivacyAccepted(e.target.checked); if (e.target.checked) setErrors((prev) => ({ ...prev, privacyAccepted: undefined })); }} aria-invalid={!!errors.privacyAccepted} aria-describedby={errors.privacyAccepted ? "beta-privacy-error" : undefined} className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" />
          <span>Acepto que Colibly me contacte sobre esta beta. Leí el <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="font-medium text-accent-ink underline underline-offset-2">aviso de privacidad<span className="sr-only"> (se abre en una pestaña nueva)</span></a>.</span>
        </label>
        {errors.privacyAccepted && <p id="beta-privacy-error" role="alert" className="mt-1.5 text-xs text-danger">{errors.privacyAccepted}</p>}
      </div>
      <Button type="submit" size="lg" fullWidth loading={submitting} icon={Send} className="mt-6" data-track="cta" data-track-location="beta_formulario">
        {submitting ? "Enviando solicitud…" : "Solicitar acceso a la beta"}
      </Button>
    </form>
  );
}
