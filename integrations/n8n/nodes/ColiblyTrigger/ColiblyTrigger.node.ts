/*
 * La interfaz está en español (México). Estas reglas de eslint-plugin-n8n-nodes-base
 * exigen textos en inglés o mayúsculas del inglés y no se pueden cumplir en español:
 * - display-name-miscased: title-case pone mayúscula en cada palabra («ID Del Contacto»).
 * - operation-option-action-miscased: sentence-case borra las letras no ASCII
 *   («configuración» → «configuraci n»); cualquier acción con acento o ñ falla.
 * - *-wrong-for-dynamic-options: exigen «Name or ID» y «Choose from the list…».
 * - boolean-without-whether, wrong-for-return-all, wrong-for-limit,
 *   wrong-for-update-fields, option-name-wrong-for-get-many: textos fijos en inglés.
 * Las demás reglas (orden alfabético, puntos finales, IDs, defaults…) siguen activas.
 */
/* eslint-disable n8n-nodes-base/node-param-display-name-miscased, n8n-nodes-base/node-param-description-wrong-for-dynamic-multi-options */
import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { coliblyApiRequest, getAccounts } from '../Colibly/GenericFunctions';
import { verifySignature } from '../Colibly/signature';

// Eventos que Colibly publica por webhook (lib/events/types.ts → DOMAIN_EVENT_CATALOG).
const EVENTS = [
	{ name: 'Número conectado', value: 'account.connected', description: 'Se conectó un número (desde el panel o con un enlace de conexión)' },
	{ name: 'Cambió la calidad del número', value: 'account.quality_changed', description: 'Cambió la calidad o el límite de envío del número' },
	{ name: 'Cita creada', value: 'appointment.created', description: 'Se agendó una cita nueva' },
	{ name: 'Cambió el estado de una cita', value: 'appointment.status_changed', description: 'Cambio de estado de una cita' },
	{ name: 'Llamada contestada', value: 'call.answered', description: 'Llamada de WhatsApp contestada' },
	{ name: 'Llamada terminada', value: 'call.ended', description: 'Llamada terminada: contestada, perdida, rechazada o fallida' },
	{ name: 'Llamada sonando', value: 'call.ringing', description: 'Llamada de WhatsApp sonando' },
	{ name: 'Contacto creado', value: 'contact.created', description: 'Contacto nuevo' },
	{ name: 'Cambió la etapa del lead', value: 'contact.lead_status_changed', description: 'Cambio de etapa del lead' },
	{ name: 'Cambió la preferencia de marketing', value: 'contact.marketing_preference_changed', description: 'Pidió dejar de recibir marketing (o volver a recibirlo)' },
	{ name: 'Conversación asignada', value: 'conversation.assigned', description: 'Se asignó una conversación a una persona o equipo' },
	{ name: 'Conversación resuelta', value: 'conversation.resolved', description: 'Una conversación se marcó como resuelta' },
	{ name: 'Bienvenida solicitada', value: 'conversation.welcome_requested', description: 'Abrió el chat por primera vez sin escribir' },
	{ name: 'Flow completado', value: 'flow.completed', description: 'Terminó un formulario de WhatsApp (Flow)' },
	{ name: 'Lead de anuncio capturado', value: 'lead.ad_captured', description: 'Lead llegado de un anuncio (CTWA o Instant Form)' },
	{ name: 'Lead calificado', value: 'lead.scored', description: 'Lead calificado por un calificador IA' },
	{ name: 'Mensaje recibido', value: 'message.received', description: 'Mensaje recibido de un contacto' },
	{ name: 'Mensaje enviado', value: 'message.sent', description: 'Mensaje enviado por cualquier vía' },
	{ name: 'Cambió el estado de un mensaje', value: 'message.status_changed', description: 'Entregado, leído o fallido (solo WhatsApp)' },
	{ name: 'Mensaje actualizado', value: 'message.updated', description: 'Un mensaje guardado cambió (su archivo quedó listo…)' },
	{ name: 'Pedido recibido', value: 'order.received', description: 'Pedido desde el carrito del catálogo' },
	{ name: 'Etiqueta agregada', value: 'tag.added', description: 'Etiqueta agregada a un contacto o conversación' },
	{ name: 'Cambió la categoría de una plantilla', value: 'template.category_changed', description: 'Meta cambió la categoría de una plantilla' },
	{ name: 'Cambió el estado de una plantilla', value: 'template.status_changed', description: 'Meta aprobó, rechazó o pausó una plantilla' },
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
				displayName: 'Eventos',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: ['message.received'],
				options: [{ name: 'Todos los eventos', value: '*', description: 'Todos los eventos, también los que se agreguen después' }, ...EVENTS],
			},
			{
				displayName: 'Cuentas (nombres o IDs)',
				name: 'accountIds',
				type: 'multiOptions',
				typeOptions: { loadOptionsMethod: 'getAccounts' },
				default: [],
				description: 'Solo eventos de estas cuentas (vacío = todas). La lista muestra solo las cuentas a las que tiene acceso la API key. Elige de la lista o indica los IDs con una <a href="https://docs.n8n.io/code/expressions/">expresión</a>.',
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
					// Una cuenta que la API key no ve no se puede filtrar: antes se descartaba en
					// silencio y el webhook quedaba escuchando TODAS las cuentas.
					const unknown = selected.filter((id) => !channelById.has(id));
					if (unknown.length) {
						throw new NodeOperationError(
							this.getNode(),
							`La API key no tiene acceso a ${unknown.length === 1 ? 'la cuenta' : 'las cuentas'} ${unknown.join(', ')}`,
							{
								description:
									'Quítala del campo «Cuentas (nombres o IDs)» o, en Colibly → Configuración → API, edita la key para incluir esa cuenta (o déjala sin restricción de cuentas). Solo aparecen en la lista las cuentas a las que la key tiene acceso.',
							},
						);
					}
					accountIds = selected.filter((id) => channelById.get(id) === 'WHATSAPP');
					channelAccountIds = selected.filter((id) => channelById.get(id) !== 'WHATSAPP');
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
