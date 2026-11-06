import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const updateMany = vi.fn();
const notificationCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    wATemplate: { findUnique: (...a: unknown[]) => findUnique(...a), updateMany: (...a: unknown[]) => updateMany(...a) },
    notification: { create: (...a: unknown[]) => notificationCreate(...a) },
    wAAccount: { findMany: vi.fn(), findUnique: vi.fn() },
  },
}));
const afterSpy = vi.fn();
vi.mock("next/server", () => ({ after: (fn: unknown) => afterSpy(fn) }));
vi.mock("@/lib/meta/platform-app", () => ({ validateWhatsAppWebhookSignature: vi.fn() }));
vi.mock("@/lib/whatsapp/template-sync", () => ({ syncAccountTemplates: vi.fn() }));

import { applyTemplateCategoryUpdate, applyTemplateStatusUpdate } from "@/lib/whatsapp/template-webhook";

const row = { id: "t1", name: "promo", status: "PENDING", statusReason: null, category: "MARKETING" };

describe("applyTemplateStatusUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMany.mockResolvedValue({ count: 1 });
  });

  it("aprueba la plantilla y avisa al dueño de la cuenta", async () => {
    findUnique.mockResolvedValue(row);
    await applyTemplateStatusUpdate("acc1", "user1", { event: "APPROVED", message_template_id: 123 });
    expect(findUnique).toHaveBeenCalledWith({ where: { waAccountId_templateId: { waAccountId: "acc1", templateId: "123" } } });
    expect(updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "t1", status: "PENDING" }, data: { status: "APPROVED", statusReason: null } });
    expect(notificationCreate.mock.calls[0][0].data).toMatchObject({ userId: "user1", type: "ACCOUNT_STATUS", title: 'Plantilla "promo" aprobada' });
  });

  it("un reintento de Meta (mismo estado) no avisa dos veces", async () => {
    findUnique.mockResolvedValue({ ...row, status: "APPROVED" });
    await applyTemplateStatusUpdate("acc1", "user1", { event: "APPROVED", message_template_id: 123 });
    expect(updateMany).not.toHaveBeenCalled();
    expect(notificationCreate).not.toHaveBeenCalled();
  });

  it("si otra entrega ganó la carrera, no avisa", async () => {
    findUnique.mockResolvedValue(row);
    updateMany.mockResolvedValue({ count: 0 });
    await applyTemplateStatusUpdate("acc1", "user1", { event: "REJECTED", reason: "SCAM", message_template_id: 1 });
    expect(notificationCreate).not.toHaveBeenCalled();
  });

  it("un rechazo guarda el motivo y lo cuenta en la notificación", async () => {
    findUnique.mockResolvedValue(row);
    await applyTemplateStatusUpdate("acc1", "user1", { event: "REJECTED", reason: "INVALID_FORMAT", message_template_id: 1 });
    expect(updateMany.mock.calls[0][0].data).toMatchObject({ status: "REJECTED", statusReason: "formato no válido" });
    expect(notificationCreate.mock.calls[0][0].data.body).toContain("formato no válido");
  });

  it("FLAGGED conserva el estado y guarda el aviso", async () => {
    findUnique.mockResolvedValue({ ...row, status: "APPROVED" });
    await applyTemplateStatusUpdate("acc1", "user1", { event: "FLAGGED", message_template_id: 1 });
    expect(updateMany.mock.calls[0][0].data).toMatchObject({ status: "APPROVED" });
    expect(updateMany.mock.calls[0][0].data.statusReason).toMatch(/calidad/);
    expect(notificationCreate).toHaveBeenCalledOnce();
  });

  it("una plantilla que no conocemos dispara una sincronización en segundo plano", async () => {
    findUnique.mockResolvedValue(null);
    await applyTemplateStatusUpdate("acc1", "user1", { event: "APPROVED", message_template_id: 999 });
    expect(afterSpy).toHaveBeenCalledOnce();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("ignora eventos sin id de plantilla o con estado desconocido", async () => {
    await applyTemplateStatusUpdate("acc1", "user1", { event: "APPROVED" });
    findUnique.mockResolvedValue(row);
    await applyTemplateStatusUpdate("acc1", "user1", { event: "ALGO_NUEVO", message_template_id: 1 });
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("applyTemplateCategoryUpdate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("guarda la categoría nueva que Meta asignó", async () => {
    findUnique.mockResolvedValue(row);
    await applyTemplateCategoryUpdate("acc1", { message_template_id: 1, new_category: "utility" });
    expect(updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "t1", category: "MARKETING" }, data: { category: "UTILITY" } });
  });

  it("no hace nada si la categoría no cambió", async () => {
    findUnique.mockResolvedValue(row);
    await applyTemplateCategoryUpdate("acc1", { message_template_id: 1, new_category: "MARKETING" });
    expect(updateMany).not.toHaveBeenCalled();
  });
});
