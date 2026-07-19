import { ChatListSkeleton, ChatBubblesSkeleton } from "@/app/components/whatsapp/chat-skeletons";

// Igual que whatsapp/chat/loading.tsx, pero aquí el panel de conversación se
// muestra también en móvil (hay un chat seleccionado por la URL).
export default function ChatDetailLoading() {
  return (
    <div className="flex flex-1 min-h-0 h-full">
      <ChatListSkeleton />
      <div className="flex flex-col flex-1 min-w-0 p-4">
        <ChatBubblesSkeleton className="flex-1" />
      </div>
    </div>
  );
}
