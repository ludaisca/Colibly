import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, withApiErrors } from "@/lib/api/respond";
import { findScopedConversation, serializeConversation } from "@/lib/api/resources";

type Params = { params: Promise<{ id: string }> };

export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "conversations:read");
  const { id } = await params;
  const found = await findScopedConversation(ctx, id);
  if (found.kind === "whatsapp") {
    const { chat } = found.target;
    return apiOk(serializeConversation(chat, chat.accountId, "WHATSAPP"));
  }
  const { conversation } = found.target;
  return apiOk(serializeConversation(conversation, conversation.channelAccountId, conversation.channelAccount.channel));
});
