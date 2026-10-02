"use client";

import { useSearchParams } from "next/navigation";
import { ChatWorkspace } from "@/app/components/whatsapp/chat-workspace";
import type { AccountOption } from "@/app/components/whatsapp/chat-shared";

export function ChatPageView({
  initialAccounts,
  initialAccountId,
  initialChatId,
}: {
  initialAccounts: AccountOption[];
  initialAccountId?: string;
  initialChatId?: string;
}) {
  const searchParams = useSearchParams();
  const hasReplied = searchParams.get("hasReplied");

  return (
    <ChatWorkspace
      initialAccounts={initialAccounts}
      initialAccountId={initialAccountId ?? searchParams.get("accountId") ?? undefined}
      initialChatId={initialChatId}
      initialCampaignId={searchParams.get("campaignId") ?? undefined}
      initialHasReplied={hasReplied === "yes" || hasReplied === "no" ? hasReplied : ""}
      initialSearch={searchParams.get("search") ?? undefined}
    />
  );
}
