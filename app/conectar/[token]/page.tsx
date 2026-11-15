import type { Metadata } from "next";
import { Card } from "@/app/components/ui/card";
import { BrandMark } from "@/app/components/ui/logo";
import { notFound } from "next/navigation";
import { BRAND_NAME } from "@/lib/brand";
import { siteUrl } from "@/lib/app-url";
import { findOnboardingLinkByToken, onboardingLinkBlocker } from "@/lib/whatsapp/onboarding-links";
import { ConnectWhatsApp } from "./_connect";

// El layout raíz ya agrega " · Colibly" (template): aquí solo el título.
export const metadata: Metadata = { title: "Conectar WhatsApp", robots: { index: false, follow: false } };

// Página pública de un enlace de conexión (POST /api/v1/onboarding-links): el
// cliente de quien creó el enlace conecta su número con su Facebook, sin
// cuenta en Colibly. El token de la URL es la credencial.
export default async function ConectarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await findOnboardingLinkByToken(token);
  // Un token que no existe responde 404 (la página de no encontrado), no 200.
  if (!link) notFound();
  const blocker = await onboardingLinkBlocker(link);

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md p-6">
        <div className="flex items-center gap-2">
          <BrandMark className="h-7 w-7" />
          <span className="text-sm font-medium text-muted-darker">{BRAND_NAME}</span>
        </div>
        <h1 className="mt-4 font-display text-xl font-semibold tracking-tight text-foreground">Conecta tu WhatsApp</h1>
        <p className="mt-1 text-sm text-muted-darker">
          {link.organization.name} te pidió conectar tu número{link.name ? ` (${link.name})` : ""} para atender a tus clientes desde {BRAND_NAME}.
        </p>
        {blocker ? <p className="mt-4 text-sm text-foreground">{blocker}</p> : <ConnectWhatsApp token={token} />}
        <p className="mt-6 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-4 text-sm">
          <a href="/login" className="text-accent-ink underline underline-offset-2">Entrar a {BRAND_NAME}</a>
          <a href={siteUrl("/contacto")} className="text-accent-ink underline underline-offset-2">Contactar a soporte</a>
        </p>
      </Card>
    </main>
  );
}
