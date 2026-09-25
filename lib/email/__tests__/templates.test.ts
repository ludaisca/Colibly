import { describe, expect, it } from "vitest";
import { invitationTemplate, passwordResetTemplate, verifyEmailTemplate } from "../templates";

// El nombre del negocio y el del invitador los escribe el cliente: no deben
// poder inyectar HTML en correos que se envían a terceros.
describe("plantillas de correo", () => {
  it("escapa el HTML de datos del cliente", () => {
    const msg = invitationTemplate({
      to: "x@y.com",
      organizationName: `<img src=x onerror="alert(1)">Spa`,
      inviterName: `<a href="https://phish.example">Ana</a>`,
      role: "user",
      url: "https://app.example/invitacion?token=abc",
    });
    expect(msg.html).not.toContain("<img");
    expect(msg.html).not.toContain(`<a href="https://phish.example">`);
    expect(msg.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;Spa");
  });

  it("incluye el enlace en HTML y en texto plano", () => {
    const url = "https://app.example/restablecer?token=tok_123";
    const msg = passwordResetTemplate({ to: "x@y.com", name: "Ana", url });
    expect(msg.text).toContain(url);
    expect(msg.html).toContain(`href="${url}"`);
  });

  it("saluda sin nombre cuando no hay", () => {
    const msg = verifyEmailTemplate({ to: "x@y.com", name: null, url: "https://a/b" });
    expect(msg.text.startsWith("Hola,")).toBe(true);
    expect(msg.subject).toBe("Confirma tu correo en SunflowCRM");
  });

  it("traduce el rol de la invitación", () => {
    const msg = invitationTemplate({ to: "x@y.com", organizationName: "Spa", inviterName: null, role: "ejecutivo", url: "https://a/b" });
    expect(msg.text).toContain("Un administrador te invitó a unirte a Spa en SunflowCRM como ejecutivo.");
  });
});
