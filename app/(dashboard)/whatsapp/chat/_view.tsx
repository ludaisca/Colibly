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
  const assigned = searchParams.get("assigned");
  const priority = searchParams.get("priority");
  const snoozed = searchParams.get("snoozed");

  return (
    <ChatWorkspace
      initialAccounts={initialAccounts}
      initialAccountId={initialAccountId ?? searchParams.get("accountId") ?? undefined}
      initialChatId={initialChatId}
      initialCampaignId={searchParams.get("campaignId") ?? undefined}
      initialHasReplied={hasReplied === "yes" || hasReplied === "no" ? hasReplied : ""}
      initialAssigned={assigned === "me" || assigned === "unassigned" ? assigned : ""}
      initialPriority={priority === "LOW" || priority === "NORMAL" || priority === "HIGH" || priority === "URGENT" ? priority : ""}
      initialSnoozed={snoozed === "only" || snoozed === "all" ? snoozed : ""}
      initialSearch={searchParams.get("search") ?? undefined}
      initialContactId={searchParams.get("contacto") ?? undefined}
    />
  );
}
