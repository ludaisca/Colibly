import { TemplateMetricsView } from "@/app/components/whatsapp/template-metrics-view";

export default async function TemplateMetricsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TemplateMetricsView templateId={id} />;
}
