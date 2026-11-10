import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { coliblyApiRequest, getAccounts } from '../Colibly/GenericFunctions';
import { verifySignature } from '../Colibly/signature';

// Eventos que Colibly publica por webhook (lib/events/types.ts → DOMAIN_EVENT_CATALOG).
const EVENTS = [
	{ name: 'Appointment Created', value: 'appointment.created', description: 'Cita creada' },
	{ name: 'Appointment Status Changed', value: 'appointment.status_changed', description: 'Cambio de estado de una cita' },
	{ name: 'Contact Created', value: 'contact.created', description: 'Contacto nuevo' },
	{ name: 'Contact Lead Status Changed', value: 'contact.lead_status_changed', description: 'Cambio de etapa del lead' },
	{ name: 'Conversation Assigned', value: 'conversation.assigned', description: 'Conversación asignada' },
	{ name: 'Conversation Resolved', value: 'conversation.resolved', description: 'Conversación resuelta' },
	{ name: 'Lead Ad Captured', value: 'lead.ad_captured', description: 'Lead llegado de un anuncio (CTWA o Instant Form)' },
	{ name: 'Lead Scored', value: 'lead.scored', description: 'Lead calificado por un calificador IA' },
	{ name: 'Message Received', value: 'message.received', description: 'Mensaje recibido de un contacto' },
	{ name: 'Message Sent', value: 'message.sent', description: 'Mensaje enviado por cualquier vía' },
	{ name: 'Message Status Changed', value: 'message.status_changed', description: 'Entregado, leído o fallido (solo WhatsApp)' },
	{ name: 'Message Updated', value: 'message.updated', description: 'Un mensaje guardado cambió (su archivo quedó listo…)' },
	{ name: 'Tag Added', value: 'tag.added', description: 'Etiqueta agregada a un contacto o conversación' },
];

export class ColiblyTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Colibly Trigger',
		name: 'coliblyTrigger',
		icon: { light: 'file:colibly.svg', dark: 'file:colibly.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Inicia el flujo cuando pasa algo en Colibly (mensaje recibido, contacto nuevo, cambio de etapa…)',
		defaults: { name: 'Colibly Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'coliblyApi', required: true }],
		webhooks: [{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' }],
		properties: [
			{
				displayName:
					'Al activar el flujo, Colibly crea solo su webhook (la API key necesita el permiso «Administrar webhooks salientes») y cada entrega llega firmada. La URL de n8n debe ser pública por HTTPS.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: ['message.received'],
				options: [{ name: 'All Events', value: '*', description: 'Todos los eventos, también los que se agreguen después' }, ...EVENTS],
			},
			{
				displayName: 'Account Names or IDs',
				name: 'accountIds',
				type: 'multiOptions',
				typeOptions: { loadOptionsMethod: 'getAccounts' },
				default: [],
				description: 'Solo eventos de estas cuentas (vacío = todas las de la API key). Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
		],
	};

	methods = { loadOptions: { getAccounts } };

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				if (!data.webhookId) return false;
				try {
					const endpoint = (await coliblyApiRequest.call(this, 'GET', `/webhooks/${encodeURIComponent(data.webhookId as string)}`)) as IDataObject;
					return endpoint?.url === this.getNodeWebhookUrl('default');
				} catch {
					delete data.webhookId;
					delete data.secret;
					return false;
				}
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const url = this.getNodeWebhookUrl('default') as string;
				const events = this.getNodeParameter('events') as string[];
				const selected = this.getNodeParameter('accountIds', []) as string[];

				// La API separa cuentas de WhatsApp y de otros canales: se reparten según /accounts.
				let accountIds: string[] = [];
				let channelAccountIds: string[] = [];
				if (selected.length) {
					const res = (await coliblyApiRequest.call(this, 'GET', '/accounts')) as { data?: IDataObject[] };
					const channelById = new Map((res.data ?? []).map((a) => [a.id as string, a.channel as string]));
					accountIds = selected.filter((id) => channelById.get(id) === 'WHATSAPP');
					channelAccountIds = selected.filter((id) => channelById.has(id) && channelById.get(id) !== 'WHATSAPP');
				}

				const workflowName = (this.getWorkflow().name ?? 'flujo').toString();
				const endpoint = (await coliblyApiRequest.call(this, 'POST', '/webhooks', {
					name: `n8n · ${workflowName}`.slice(0, 80),
					url,
					events: events.includes('*') ? ['*'] : events,
					accountIds,
					channelAccountIds,
				})) as IDataObject;

				const data = this.getWorkflowStaticData('node');
				data.webhookId = endpoint.id;
				// El secreto solo viene al crear: con él se verifica cada entrega.
				data.secret = endpoint.secret;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				if (data.webhookId) {
					try {
						await coliblyApiRequest.call(this, 'DELETE', `/webhooks/${encodeURIComponent(data.webhookId as string)}`);
					} catch (error) {
						// Ya no existe en Colibly (o se borró a mano): se olvida igual.
						this.logger.warn(`Colibly: no se pudo borrar el webhook ${data.webhookId as string}: ${(error as Error).message}`);
					}
				}
				delete data.webhookId;
				delete data.secret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const res = this.getResponseObject();
		const secret = this.getWorkflowStaticData('node').secret as string | undefined;
		const raw = (req as unknown as { rawBody?: Buffer }).rawBody?.toString('utf8') ?? JSON.stringify(req.body ?? {});
		const signature = req.headers['x-colibly-signature'] as string | undefined;

		// Sin firma válida no se dispara el flujo (alguien más podría llamar la URL).
		if (!secret || !verifySignature(signature, raw, secret)) {
			res.status(401).json({ error: 'Firma inválida' });
			return { noWebhookResponse: true };
		}

		const body = (this.getBodyData() ?? {}) as IDataObject;
		return {
			workflowData: [
				this.helpers.returnJsonArray({
					...body,
					_colibly: {
						event: req.headers['x-colibly-event'],
						deliveryId: req.headers['x-colibly-delivery'],
						eventId: req.headers['x-colibly-event-id'],
					},
				}),
			],
		};
	}
}
