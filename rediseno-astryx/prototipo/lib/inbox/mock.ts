// Datos ficticios para el prototipo. Todo se calcula a partir de `now`, que
// llega del servidor: así servidor y navegador pintan lo mismo (sin errores
// de hidratación) y las esperas siempre se ven "vivas".
import type {ChatItem, Message} from './types';

const MIN = 60_000;

type Seed = Omit<ChatItem, 'lastMessageAt' | 'waitingSince' | 'lastMessage'> & {
  /** Minutos desde el último mensaje. */
  lastAgo: number;
  /** Minutos esperando (null = nadie espera). */
  waitingAgo: number | null;
  /** [dirección, texto, minutos atrás, sentVia?] del más viejo al más nuevo. */
  thread: Array<['in' | 'out', string, number, ('agent' | 'bot' | 'campaign')?]>;
};

const SEEDS: Seed[] = [
  {
    id: 'c1', name: 'Mariana Torres', phone: '+52 55 1234 5678', channel: 'WHATSAPP',
    accountName: 'Ventas CDMX', unreadCount: 3, status: 'OPEN', priority: 'HIGH',
    assignedTo: null, leadStatus: 'QUALIFIED', lastAgo: 72, waitingAgo: 74,
    thread: [
      ['in', 'Hola, vi su anuncio del plan anual', 26 * 60, undefined],
      ['out', '¡Hola Mariana! Con gusto te explico. ¿Para cuántas personas sería?', 26 * 60 - 3, 'bot'],
      ['in', 'Somos 4 en la oficina', 80],
      ['in', '¿Tienen descuento si pagamos el año completo?', 74],
      ['in', '¿Y aceptan transferencia?', 72],
    ],
  },
  {
    id: 'c2', name: 'Jorge Ramírez', phone: '+52 33 9876 5432', channel: 'WHATSAPP',
    accountName: 'Soporte', unreadCount: 1, status: 'OPEN', priority: 'NORMAL',
    assignedTo: 'Ana', leadStatus: 'CUSTOMER', lastAgo: 22, waitingAgo: 22,
    thread: [
      ['out', 'Tu pedido #4821 salió hoy. Te comparto la guía: 7721 0045 88', 3 * 60, 'agent'],
      ['in', 'Gracias. ¿Llega antes del viernes?', 22],
    ],
  },
  {
    id: 'c3', name: 'Café La Esquina', phone: null, channel: 'INSTAGRAM',
    accountName: '@colibly.demo', unreadCount: 0, status: 'OPEN', priority: 'NORMAL',
    assignedTo: 'Ana', leadStatus: 'CONTACTED', lastAgo: 9, waitingAgo: 9,
    thread: [
      ['in', 'Hola, ¿hacen envíos a Puebla?', 40],
      ['out', 'Sí, enviamos a todo el país. ¿Qué producto te interesa?', 35, 'agent'],
      ['in', 'Las tazas de cerámica, unas 30 piezas', 9],
    ],
  },
  {
    id: 'c4', name: 'Luis Herrera', phone: '+52 81 5555 0101', channel: 'WHATSAPP',
    accountName: 'Ventas CDMX', unreadCount: 0, status: 'PENDING', priority: 'NORMAL',
    assignedTo: 'Ana', leadStatus: 'NEW', lastAgo: 30 * 60, waitingAgo: null,
    thread: [
      ['out', 'Hola Luis, te escribimos por la promoción de noviembre', 31 * 60, 'campaign'],
      ['in', 'Me interesa, mándame precios', 30 * 60 + 10],
      ['out', 'Claro, te comparto la lista de precios: colibly.com/precios', 30 * 60, 'agent'],
    ],
  },
  {
    id: 'c5', name: 'Visitante 4F2A', phone: null, channel: 'WEBCHAT',
    accountName: 'Sitio web', unreadCount: 2, status: 'OPEN', priority: 'URGENT',
    assignedTo: null, leadStatus: 'NEW', lastAgo: 3, waitingAgo: 4,
    thread: [
      ['in', 'Hola', 4],
      ['in', 'Necesito cancelar una cita de hoy a las 5', 3],
    ],
  },
  {
    id: 'c6', name: 'Sofía Méndez', phone: null, channel: 'MESSENGER',
    accountName: 'Colibly Demo', unreadCount: 0, status: 'RESOLVED', priority: 'LOW',
    assignedTo: 'Ana', leadStatus: 'CUSTOMER', lastAgo: 2 * 24 * 60, waitingAgo: null,
    thread: [
      ['in', 'Ya me llegó todo, muchas gracias', 2 * 24 * 60 + 5],
      ['out', 'Qué gusto, Sofía. Cualquier cosa aquí estamos', 2 * 24 * 60, 'agent'],
    ],
  },
  {
    id: 'c7', name: 'Ernesto Vidal', phone: '+52 55 4433 2211', channel: 'TELEGRAM',
    accountName: 'Bot Telegram', unreadCount: 1, status: 'OPEN', priority: 'NORMAL',
    assignedTo: null, leadStatus: 'CONTACTED', lastAgo: 3 * 24 * 60, waitingAgo: 3 * 24 * 60,
    thread: [['in', '¿Siguen teniendo el plan Pro en promoción?', 3 * 24 * 60]],
  },
];

export function buildMockInbox(nowIso: string): {chats: ChatItem[]; messages: Message[]} {
  const now = new Date(nowIso).getTime();
  const at = (minAgo: number) => new Date(now - minAgo * MIN).toISOString();

  const chats: ChatItem[] = [];
  const messages: Message[] = [];
  for (const {thread, lastAgo, waitingAgo, ...rest} of SEEDS) {
    chats.push({
      ...rest,
      lastMessage: thread[thread.length - 1][1],
      lastMessageAt: at(lastAgo),
      waitingSince: waitingAgo === null ? null : at(waitingAgo),
    });
    thread.forEach(([dir, body, ago, via], i) =>
      messages.push({
        id: `${rest.id}-m${i}`,
        chatId: rest.id,
        direction: dir === 'in' ? 'INBOUND' : 'OUTBOUND',
        body,
        timestamp: at(ago),
        sentVia: dir === 'out' ? (via ?? 'agent') : undefined,
        senderName: dir === 'out' ? (via === 'bot' ? 'Bot' : via === 'campaign' ? 'Campaña' : 'Ana') : undefined,
        status: dir === 'out' ? 'read' : undefined,
      }),
    );
  }
  return {chats, messages};
}
