import {requireTenant} from '@/lib/tenant';
import {buildMockInbox} from '@/lib/inbox/mock';
import {InboxView} from './InboxView';

export const metadata = {title: 'Chats · CRM'};

/**
 * Prototipo de la bandeja de Colibly con Astryx. Datos ficticios: cuando se
 * lleve a Colibly, `buildMockInbox` se reemplaza por su `/api/inbox/sync`.
 */
export default async function BandejaPage() {
  const {userName} = await requireTenant();
  // `now` viaja al cliente para que servidor y navegador calculen igual las esperas.
  const now = new Date().toISOString();
  const {chats, messages} = buildMockInbox(now);

  return <InboxView now={now} userName={userName} initialChats={chats} initialMessages={messages} />;
}
