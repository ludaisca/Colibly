"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Mail, Send } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { FormField } from "@/app/components/ui/form-field";
import { Banner } from "@/app/components/ui/banner";
import { betaApplicationSchema } from "@/lib/beta-application";
import { track } from "@/lib/analytics/client";
import { BRAND_CONTACT_EMAIL } from "@/lib/brand";

type Fields = "name" | "businessName" | "email" | "phone" | "description" | "privacyAccepted";

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
  const nameRef = useRef<HTMLInputElement>(null);
  const businessRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const privacyRef = useRef<HTMLInputElement>(null);

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
        if (!next[field]) next[field] = field === "privacyAccepted" ? "Confirma que podemos contactarte." : issue.message;
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
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No pudimos enviar tu solicitud.");
      setSent(true);
      track({ name: "beta_apply" });
      requestAnimationFrame(() => successRef.current?.focus());
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "No pudimos enviar tu solicitud.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-[20px] border border-success-border bg-success-bg p-7 text-center shadow-sm sm:p-10" role="status">
        <CheckCircle2 className="mx-auto text-success" size={40} aria-hidden />
        <h2 ref={successRef} tabIndex={-1} className="mt-4 font-display text-2xl font-semibold text-foreground focus:outline-none">Recibimos tu solicitud</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">Te escribiremos al correo que nos dejaste. Mientras tanto, puedes crear tu cuenta gratis y empezar tu prueba cuando quieras.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="rounded-[20px] border border-border bg-surface p-5 shadow-lg sm:p-7">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent-ink">Contacto personal</p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-foreground">¿Prefieres que te orientemos?</h2>
        <p className="mt-2 text-sm text-muted">Es opcional: no necesitas enviarlo para crear tu cuenta. Déjanos tus datos de contacto y te escribimos.</p>
      </div>
      {serverError && <Banner tone="danger" className="mb-5">{serverError} <a href={`mailto:${BRAND_CONTACT_EMAIL}`} className="underline">También puedes escribirnos.</a></Banner>}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Tu nombre" required error={errors.name}>
          {(id, describedBy) => <Input ref={nameRef} id={id} aria-describedby={describedBy} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ana López" error={errors.name} />}
        </FormField>
        <FormField label="Nombre de tu negocio" required error={errors.businessName}>
          {(id, describedBy) => <Input ref={businessRef} id={id} aria-describedby={describedBy} autoComplete="organization" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Estudio Aurora" error={errors.businessName} />}
        </FormField>
        <FormField label="Correo donde te escribimos" required error={errors.email}>
          {(id, describedBy) => <Input ref={emailRef} id={id} aria-describedby={describedBy} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ana@negocio.com" error={errors.email} />}
        </FormField>
        <FormField label="WhatsApp de contacto" required error={errors.phone}>
          {(id, describedBy) => <Input ref={phoneRef} id={id} aria-describedby={describedBy} type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+52 55 1234 5678" error={errors.phone} />}
        </FormField>
      </div>
      <FormField label="¿Cómo atienden sus mensajes hoy?" hint="Opcional. Con una frase basta." error={errors.description} className="mt-4">
        {(id, describedBy) => <Textarea ref={descriptionRef} id={id} aria-describedby={describedBy} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={400} placeholder="Somos dos personas y atendemos desde un solo celular…" error={errors.description} />}
      </FormField>
      <div className="absolute -left-[10000px]" aria-hidden="true">
        <label htmlFor="beta-website">Sitio web</label>
        <input id="beta-website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      <div className="mt-5">
        <label className="flex items-start gap-3 text-sm leading-6 text-muted">
          <input ref={privacyRef} type="checkbox" checked={privacyAccepted} onChange={(e) => setPrivacyAccepted(e.target.checked)} aria-invalid={!!errors.privacyAccepted} aria-describedby={errors.privacyAccepted ? "beta-privacy-error" : undefined} className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" />
          <span>Acepto que Colibly me contacte sobre mi solicitud. Leí el <a href="/privacidad" className="font-medium text-accent-ink underline underline-offset-2">aviso de privacidad</a>.</span>
        </label>
        {errors.privacyAccepted && <p id="beta-privacy-error" role="alert" className="mt-1.5 text-xs text-danger">{errors.privacyAccepted}</p>}
      </div>
      <Button type="submit" size="lg" fullWidth loading={submitting} icon={Send} className="mt-6" data-track="cta" data-track-location="beta_formulario">
        {submitting ? "Enviando solicitud…" : "Quiero que me contacten"}
      </Button>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted"><Mail size={13} aria-hidden /> Sin tarjeta ni compromiso de pago</p>
    </form>
  );
}
