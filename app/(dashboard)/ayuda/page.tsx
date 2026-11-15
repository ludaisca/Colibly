import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appUrl, siteUrl } from "@/lib/app-url";
import { BRAND_CONTACT_EMAIL, BRAND_NAME } from "@/lib/brand";
import { supportWhatsappNumber, supportWhatsappUrl } from "@/lib/help/support";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionHeader } from "@/app/components/ui/section-header";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";

// Ayuda dentro de la app: primeros pasos, preguntas cortas, guías públicas y
// soporte. Lo ven todos los roles; los pasos de configuración, solo el admin.

const STEPS = [
  { href: "/whatsapp/cuentas", title: "Conecta tu WhatsApp", text: "Entra con Facebook y elige tu número. Si ya usas WhatsApp Business en el celular, puedes seguir usándolo." },
  { href: "/whatsapp/bots", title: "Crea un bot de IA", text: "Dile cómo se llama tu negocio, qué vendes y cuánto cuesta. Pruébalo en la pestaña Probar antes de activarlo." },
  { href: "/whatsapp/contactos", title: "Importa tus contactos", text: "Sube un CSV con cabecera o agrégalos a mano. Aunque aún no conectes WhatsApp, se vinculan solos al conectarlo." },
  { href: "/whatsapp/campanas/nueva", title: "Prepara tu primera campaña", text: "Elige una plantilla aprobada y los destinatarios. Se guarda como borrador: nada se envía hasta que lo confirmes." },
] as const;

const FAQ = [
  { q: "¿Por qué no puedo escribirle a un cliente?", a: "WhatsApp solo deja escribir libremente durante las 24 h siguientes al último mensaje del cliente. Pasado ese tiempo necesitas una plantilla aprobada." },
  { q: "¿Los mensajes de WhatsApp tienen costo?", a: "Meta cobra aparte algunos mensajes según su categoría y país. Ese cargo se paga directo a Meta; no está incluido en tu licencia." },
  { q: "¿Puedo probar el bot sin conectar WhatsApp?", a: "Sí. Crea el bot sin cuenta y chatea con él en la pestaña Probar. Mientras no conectes un canal tienes mensajes de prueba limitados." },
  { q: "¿Qué pasa cuando termina mi prueba?", a: "La cuenta queda en solo lectura y tus datos se conservan. Elige un plan en Configuración → Plan y facturación para seguir donde te quedaste." },
  { q: "¿Cómo invito a mi equipo?", a: "En Usuarios (dentro de «Más herramientas»), con «Invitar por correo». Cada persona usa una licencia." },
] as const;

export default async function AyudaPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const isAdmin = session.user.role === "admin";

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { organization: { select: { name: true } } } });
  const whatsapp = supportWhatsappNumber(process.env.SUPPORT_WHATSAPP);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Ayuda" />

      {isAdmin && (
        <Card as="section" className="space-y-4">
          <SectionHeader title="Primeros pasos" />
          <ol className="space-y-3">
            {STEPS.map((step, i) => (
              <li key={step.href} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-xs font-semibold text-accent-ink" aria-hidden>{i + 1}</span>
                <div className="min-w-0">
                  <a href={step.href} className="text-sm font-semibold text-accent-ink underline underline-offset-2">{step.title}</a>
                  <p className="text-sm text-muted">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <Card as="section" className="space-y-3">
        <SectionHeader title="Preguntas frecuentes" />
        <dl className="space-y-4">
          {FAQ.map((item) => (
            <div key={item.q}>
              <dt className="text-sm font-semibold">{item.q}</dt>
              <dd className="mt-1 text-sm text-muted">{item.a}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card as="section" className="space-y-3">
        <SectionHeader title="Guías y documentación" />
        <ul className="space-y-1.5 text-sm">
          <li><a href={siteUrl("/guias")} target="_blank" rel="noopener" className="text-accent-ink underline underline-offset-2">Guías de {BRAND_NAME}</a> — CRM para WhatsApp, chatbots de IA, citas y más.</li>
          {isAdmin && <li><a href={appUrl("/docs/api")} className="text-accent-ink underline underline-offset-2">API y webhooks</a> — para conectar {BRAND_NAME} con tu ERP, tienda o Zapier.</li>}
        </ul>
      </Card>

      <Card as="section" className="space-y-3">
        <SectionHeader title="Soporte" />
        <p className="text-sm text-muted">¿Algo no funciona o tienes una duda? Escríbenos y te ayudamos.</p>
        <div className="flex flex-wrap items-center gap-2">
          {whatsapp && (
            <Button href={supportWhatsappUrl(whatsapp, user?.organization.name)} external>Escríbenos por WhatsApp</Button>
          )}
          <Button href={`mailto:${BRAND_CONTACT_EMAIL}`} variant="secondary">Correo: {BRAND_CONTACT_EMAIL}</Button>
        </div>
      </Card>
    </div>
  );
}
