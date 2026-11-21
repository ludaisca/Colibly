// Forma de los datos de la bandeja, calcada del `ChatItem` de Colibly
// (lib/chats/query.ts) para que el prototipo se conecte después a su API
// sin rehacer la UI.

export type Channel = 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER' | 'TELEGRAM' | 'WEBCHAT';
export type ChatStatus = 'OPEN' | 'PENDING' | 'RESOLVED';
export type ChatPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
/** Ruta de la venta (Contact.leadStatus). LOST se marca aparte. */
export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CUSTOMER' | 'LOST';

export interface ChatItem {
  id: string;
  name: string;
  phone: string | null;
  channel: Channel;
  accountName: string;
  lastMessage: string;
  lastMessageAt: string; // ISO
  /** Desde cuándo el cliente espera respuesta; null = nadie espera. */
  waitingSince: string | null;
  unreadCount: number;
  status: ChatStatus;
  priority: ChatPriority;
  assignedTo: string | null;
  leadStatus: LeadStatus;
}

export type MessageDirection = 'INBOUND' | 'OUTBOUND';
/** Quién mandó un saliente: un agente humano, el bot o una campaña. */
export type SentVia = 'agent' | 'bot' | 'campaign';
export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';

export interface Message {
  id: string;
  chatId: string;
  direction: MessageDirection;
  body: string;
  timestamp: string; // ISO
  sentVia?: SentVia;
  senderName?: string;
  status?: DeliveryStatus;
}

export const CHANNEL_LABEL: Record<Channel, string> = {
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  MESSENGER: 'Messenger',
  TELEGRAM: 'Telegram',
  WEBCHAT: 'Chat web',
};

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: 'Nuevo',
  CONTACTED: 'Contactado',
  QUALIFIED: 'Calificado',
  CUSTOMER: 'Cliente',
  LOST: 'Venta perdida',
};
