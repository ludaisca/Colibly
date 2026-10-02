import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { orgWhere } from "@/lib/tenancy";
import { WebhookDeliveriesView } from "../../../_webhook-deliveries";

export default async function WebhookDeliveriesPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "admin") notFound();
  const { id } = await params;
  const webhook = await prisma.webhookEndpoint.findFirst({
    where: { id, ...(await orgWhere(session.user.id)) },
    select: { id: true, name: true },
  });
  if (!webhook) notFound();
  return <WebhookDeliveriesView webhook={webhook} />;
}
