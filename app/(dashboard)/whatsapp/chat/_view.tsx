"use client";

import { useParams, useSearchParams } from "next/navigation";
import { ChatWorkspace, type StatusFilter } from "@/app/components/whatsapp/chat-workspace";
import type { AccountOption, ChatView } from "@/app/components/whatsapp/chat-shared";

const VIEWS: ChatView[] = ["all", "mine", "unassigned", "unread"];

export function ChatPageView({ initialAccounts }: { initialAccounts: AccountOption[] }) {
  const params = useParams<{ accountId?: string; chatId?: string }>();
  const searchParams = useSearchParams();
  const hasReplied = searchParams.get("hasReplied");
  const view = searchParams.get("view") as ChatView | null;
  const status = searchParams.get("status");

  return (
    <ChatWorkspace
      initialAccounts={initialAccounts}
      routeAccountId={params.accountId}
      initialAccountId={searchParams.get("accountId") ?? undefined}
      initialChatId={params.chatId}
      initialCampaignId={searchParams.get("campaignId") ?? undefined}
      initialHasReplied={hasReplied === "yes" || hasReplied === "no" ? hasReplied : ""}
      initialSearch={searchParams.get("search") ?? undefined}
      initialView={view && VIEWS.includes(view) ? view : undefined}
      initialStatus={(status === "RESOLVED" || status === "ALL" ? status : "") as StatusFilter}
    />
  );
}
