import { TemplateCreatePage } from "./_view";

export default async function NewTemplatePage({ searchParams }: { searchParams: Promise<{ accountId?: string }> }) {
  const { accountId } = await searchParams;
  return <TemplateCreatePage defaultAccountId={accountId ?? ""} />;
}
