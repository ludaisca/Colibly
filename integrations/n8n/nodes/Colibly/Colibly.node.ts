import type {
	IDataObject,
	JsonObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import {
	coliblyApiRequest,
	coliblyApiRequestAllItems,
	coliblyList,
	getAccounts,
	getRunnableAutomations,
	getTags,
	getTeams,
	getTemplates,
	getUsers,
	getWhatsappAccounts,
	idempotencyKey,
} from './GenericFunctions';

const LEAD_STATUS = [
	{ name: 'Nuevo', value: 'NEW' },
	{ name: 'Contactado', value: 'CONTACTED' },
	{ name: 'Calificado', value: 'QUALIFIED' },
	{ name: 'Cliente', value: 'CUSTOMER' },
	{ name: 'Perdido', value: 'LOST' },
];

const show = (resource: string, operation: string[]) => ({ show: { resource: [resource], operation } });

const returnAllFields = (resource: string, operation: string): INodeProperties[] => [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: show(resource, [operation]),
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: { resource: [resource], operation: [operation], returnAll: [false] } },
	},
];

const customFieldsCollection = (resource: string, operation: string[]): INodeProperties => ({
	displayName: 'Custom Fields',
	name: 'customFields',
	type: 'fixedCollection',
	typeOptions: { multipleValues: true },
	placeholder: 'Add Custom Field',
	default: {},
	description: 'Campos personalizados por su clave (key) en Colibly',
	displayOptions: show(resource, operation),
	options: [
		{
			name: 'field',
			displayName: 'Field',
			values: [
				{ displayName: 'Key', name: 'key', type: 'string', default: '' },
				{ displayName: 'Value', name: 'value', type: 'string', default: '' },
			],
		},
	],
});

function customFieldsFrom(raw: IDataObject): IDataObject | undefined {
	const list = ((raw?.field as IDataObject[]) ?? []).filter((f) => f.key);
	if (!list.length) return undefined;
	return Object.fromEntries(list.map((f) => [f.key as string, f.value === '' ? null : (f.value as string)]));
}

export class Colibly implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Colibly',
		name: 'colibly',
		icon: { light: 'file:colibly.svg', dark: 'file:colibly.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Contactos, conversaciones, mensajes de WhatsApp y automatizaciones de Colibly',
		defaults: { name: 'Colibly' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'coliblyApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Automation', value: 'automation' },
					{ name: 'Contact', value: 'contact' },
					{ name: 'Conversation', value: 'conversation' },
					{ name: 'Message', value: 'message' },
					{ name: 'Workspace', value: 'workspace', description: 'Cuentas, etiquetas, usuarios, equipos y plantillas' },
				],
				default: 'contact',
			},

			// ── Contacto ──
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['contact'] } },
				options: [
					{ name: 'Add Tag', value: 'addTag', action: 'Add a tag to a contact', description: 'Agrega una etiqueta (la crea si no existe)' },
					{ name: 'Create or Get', value: 'create', action: 'Create a contact', description: 'Crea el contacto o devuelve el que ya tiene ese teléfono' },
					{ name: 'Get', value: 'get', action: 'Get a contact' },
					{ name: 'Get Many', value: 'getAll', action: 'Get many contacts', description: 'Lista o busca contactos' },
					{ name: 'Remove Tag', value: 'removeTag', action: 'Remove a tag from a contact' },
					{ name: 'Update', value: 'update', action: 'Update a contact', description: 'Nombre, etapa, valor del trato o campos' },
				],
				default: 'getAll',
			},
			{
				displayName: 'Contact ID',
				name: 'contactId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: show('contact', ['get', 'update', 'addTag', 'removeTag']),
			},
			{
				displayName: 'WhatsApp Account Name or ID',
				name: 'accountId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getWhatsappAccounts' },
				required: true,
				default: '',
				description: 'Número de WhatsApp al que pertenece el contacto (en los demás canales los contactos se crean solos cuando escriben). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: show('contact', ['create']),
			},
			{
				displayName: 'Phone',
				name: 'phone',
				type: 'string',
				required: true,
				default: '',
				placeholder: '5215512345678',
				description: 'Con código de país, solo dígitos (se ignoran espacios y signos)',
				displayOptions: show('contact', ['create']),
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: show('contact', ['create']),
				options: [
					{ displayName: 'Name', name: 'name', type: 'string', default: '' },
					{ displayName: 'Lead Status', name: 'leadStatus', type: 'options', options: LEAD_STATUS, default: 'NEW' },
					{ displayName: 'Tags', name: 'tags', type: 'string', default: '', description: 'Nombres separados por comas; se crean si no existen' },
				],
			},
			{
				displayName: 'Update Fields',
				name: 'updateFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: show('contact', ['update']),
				options: [
					{ displayName: 'Deal Value (MXN)', name: 'dealValue', type: 'number', typeOptions: { minValue: 0, numberPrecision: 2 }, default: 0, description: 'Valor del trato en pesos' },
					{ displayName: 'Expected Close Date', name: 'expectedCloseAt', type: 'dateTime', default: '' },
					{ displayName: 'Lead Status', name: 'leadStatus', type: 'options', options: LEAD_STATUS, default: 'QUALIFIED' },
					{ displayName: 'Name', name: 'name', type: 'string', default: '' },
					{ displayName: 'Real Name', name: 'realName', type: 'string', default: '' },
				],
			},
			customFieldsCollection('contact', ['create', 'update']),
			{
				displayName: 'Tag',
				name: 'tagMode',
				type: 'options',
				options: [
					{ name: 'By Name', value: 'name' },
					{ name: 'From List', value: 'id' },
				],
				default: 'name',
				displayOptions: show('contact', ['addTag']),
			},
			{
				displayName: 'Tag Name',
				name: 'tagName',
				type: 'string',
				required: true,
				default: '',
				description: 'Se crea en la cuenta del contacto si no existe',
				displayOptions: { show: { resource: ['contact'], operation: ['addTag'], tagMode: ['name'] } },
			},
			{
				displayName: 'Tag Name or ID',
				name: 'tagId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getTags' },
				required: true,
				default: '',
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				displayOptions: { show: { resource: ['contact'], operation: ['addTag'], tagMode: ['id'] } },
			},
			{
				displayName: 'Tag Name or ID',
				name: 'removeTagId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getTags' },
				required: true,
				default: '',
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				displayOptions: show('contact', ['removeTag']),
			},
			...returnAllFields('contact', 'getAll'),
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: show('contact', ['getAll']),
				options: [
					{ displayName: 'Account Name or ID', name: 'accountId', type: 'options', typeOptions: { loadOptionsMethod: 'getAccounts' }, default: '', description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>' },
					{ displayName: 'Lead Status', name: 'leadStatus', type: 'options', options: LEAD_STATUS, default: 'NEW' },
					{ displayName: 'Search', name: 'q', type: 'string', default: '', description: 'Nombre o teléfono' },
					{ displayName: 'Tag Name or ID', name: 'tagId', type: 'options', typeOptions: { loadOptionsMethod: 'getTags' }, default: '', description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>' },
					{ displayName: 'Updated Since', name: 'updatedSince', type: 'dateTime', default: '' },
				],
			},

			// ── Conversación ──
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['conversation'] } },
				options: [
					{ name: 'Get', value: 'get', action: 'Get a conversation' },
					{ name: 'Get Many', value: 'getAll', action: 'Get many conversations' },
					{ name: 'Get Messages', value: 'getMessages', action: 'Get the messages of a conversation' },
					{ name: 'Update', value: 'update', action: 'Update a conversation', description: 'Estado, persona asignada o equipo' },
				],
				default: 'getAll',
			},
			{
				displayName: 'Conversation ID',
				name: 'conversationId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: show('conversation', ['get', 'getMessages', 'update']),
			},
			{
				displayName: 'Update Fields',
				name: 'conversationUpdate',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: show('conversation', ['update']),
				options: [
					{
						displayName: 'Status',
						name: 'status',
						type: 'options',
						options: [
							{ name: 'Abierta', value: 'OPEN' },
							{ name: 'Pendiente', value: 'PENDING' },
							{ name: 'Resuelta', value: 'RESOLVED' },
						],
						default: 'RESOLVED',
					},
					{ displayName: 'Assigned To Name or ID', name: 'assignedToId', type: 'options', typeOptions: { loadOptionsMethod: 'getUsers' }, default: '', description: 'Vacío = quitar la asignación. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.' },
					{ displayName: 'Team Name or ID', name: 'teamId', type: 'options', typeOptions: { loadOptionsMethod: 'getTeams' }, default: '', description: 'Vacío = sacarla de su equipo. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.' },
				],
			},
			...returnAllFields('conversation', 'getAll'),
			...returnAllFields('conversation', 'getMessages'),
			{
				displayName: 'Filters',
				name: 'conversationFilters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: show('conversation', ['getAll']),
				options: [
					{ displayName: 'Account Name or ID', name: 'accountId', type: 'options', typeOptions: { loadOptionsMethod: 'getAccounts' }, default: '', description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>' },
					{ displayName: 'Assigned To Name or ID', name: 'assignedToId', type: 'options', typeOptions: { loadOptionsMethod: 'getUsers' }, default: '', description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>' },
					{ displayName: 'Contact ID', name: 'contactId', type: 'string', default: '' },
					{
						displayName: 'Status',
						name: 'status',
						type: 'options',
						options: [
							{ name: 'Abierta', value: 'OPEN' },
							{ name: 'Pendiente', value: 'PENDING' },
							{ name: 'Resuelta', value: 'RESOLVED' },
						],
						default: 'OPEN',
					},
					{ displayName: 'Team Name or ID', name: 'teamId', type: 'options', typeOptions: { loadOptionsMethod: 'getTeams' }, default: '', description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>' },
				],
			},

			// ── Mensaje ──
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['message'] } },
				options: [
					{ name: 'Get', value: 'get', action: 'Get a message' },
					{ name: 'Send', value: 'send', action: 'Send a message', description: 'Texto, botones, plantilla o archivo' },
				],
				default: 'send',
			},
			{
				displayName: 'Message ID',
				name: 'messageId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: show('message', ['get']),
			},
			{
				displayName: 'Send To',
				name: 'target',
				type: 'options',
				options: [
					{ name: 'Contact', value: 'contact' },
					{ name: 'Conversation', value: 'conversation' },
				],
				default: 'contact',
				displayOptions: show('message', ['send']),
			},
			{
				displayName: 'Contact ID',
				name: 'sendContactId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['message'], operation: ['send'], target: ['contact'] } },
			},
			{
				displayName: 'Conversation ID',
				name: 'sendConversationId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['message'], operation: ['send'], target: ['conversation'] } },
			},
			{
				displayName: 'Type',
				name: 'type',
				type: 'options',
				options: [
					{ name: 'Audio', value: 'audio' },
					{ name: 'Buttons', value: 'buttons', description: 'Texto con hasta 3 botones de respuesta' },
					{ name: 'Document', value: 'document' },
					{ name: 'Image', value: 'image' },
					{ name: 'Template', value: 'template', description: 'Plantilla aprobada (necesaria fuera de la ventana de 24 h)' },
					{ name: 'Text', value: 'text' },
					{ name: 'Video', value: 'video' },
				],
				default: 'text',
				description: 'Texto, botones y archivos solo se pueden enviar dentro de la ventana de 24 h del cliente; fuera de ella usa una plantilla',
				displayOptions: show('message', ['send']),
			},
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				typeOptions: { rows: 4 },
				required: true,
				default: '',
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['text', 'buttons'] } },
			},
			{
				displayName: 'Buttons',
				name: 'buttons',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Add Button',
				default: {},
				description: 'Máximo 3 botones de hasta 20 caracteres',
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['buttons'] } },
				options: [
					{
						name: 'button',
						displayName: 'Button',
						values: [
							{ displayName: 'Title', name: 'title', type: 'string', default: '' },
							{ displayName: 'ID', name: 'id', type: 'string', default: '', description: 'Opcional; llega en la respuesta del cliente' },
						],
					},
				],
			},
			{
				displayName: 'Template Name or ID',
				name: 'templateId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getTemplates' },
				required: true,
				default: '',
				description: 'Plantillas aprobadas. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['template'] } },
			},
			{
				displayName: 'Template Parameters',
				name: 'templateParams',
				type: 'collection',
				placeholder: 'Add Parameter',
				default: {},
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['template'] } },
				options: [
					{ displayName: 'Body Parameters', name: 'bodyParams', type: 'string', default: '', description: 'Valores de {{1}}, {{2}}… en orden, separados por |' },
					{ displayName: 'Header Parameter', name: 'headerParam', type: 'string', default: '', description: 'Texto de la cabecera o URL https de la imagen, video o documento' },
					{ displayName: 'Button Parameter', name: 'buttonParam', type: 'string', default: '', description: 'Sufijo del botón con URL dinámica' },
				],
			},
			{
				displayName: 'File URL',
				name: 'mediaUrl',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'https://...',
				description: 'URL pública https del archivo',
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['image', 'document', 'audio', 'video'] } },
			},
			{
				displayName: 'File Options',
				name: 'mediaOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['image', 'document', 'audio', 'video'] } },
				options: [
					{ displayName: 'Caption', name: 'caption', type: 'string', default: '', description: 'No aplica a audios' },
					{ displayName: 'File Name', name: 'filename', type: 'string', default: '' },
					{ displayName: 'MIME Type', name: 'mimeType', type: 'string', default: '' },
				],
			},

			// ── Automatización ──
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['automation'] } },
				options: [
					{ name: 'Get Many', value: 'getAll', action: 'Get many automations' },
					{ name: 'Run', value: 'run', action: 'Run an automation for a contact', description: 'Inicia una automatización con disparador manual' },
				],
				default: 'run',
			},
			{
				displayName: 'Automation Name or ID',
				name: 'automationId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getRunnableAutomations' },
				required: true,
				default: '',
				description: 'Automatizaciones activas con disparador «manual». Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: show('automation', ['run']),
			},
			{
				displayName: 'Contact ID',
				name: 'runContactId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: show('automation', ['run']),
			},
			{
				displayName: 'Variables',
				name: 'vars',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Add Variable',
				default: {},
				displayOptions: show('automation', ['run']),
				options: [
					{
						name: 'variable',
						displayName: 'Variable',
						values: [
							{ displayName: 'Name', name: 'name', type: 'string', default: '' },
							{ displayName: 'Value', name: 'value', type: 'string', default: '' },
						],
					},
				],
			},
			{
				displayName: 'Only Runnable',
				name: 'onlyRunnable',
				type: 'boolean',
				default: true,
				description: 'Whether to list only the active automations with a manual trigger',
				displayOptions: show('automation', ['getAll']),
			},

			// ── Espacio de trabajo (catálogos) ──
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['workspace'] } },
				options: [
					{ name: 'Get Accounts', value: 'accounts', action: 'Get connected accounts' },
					{ name: 'Get Me', value: 'me', action: 'Get the key identity', description: 'Dueño, permisos y cuentas de la API key' },
					{ name: 'Get Tags', value: 'tags', action: 'Get tags' },
					{ name: 'Get Teams', value: 'teams', action: 'Get teams' },
					{ name: 'Get Templates', value: 'templates', action: 'Get templates' },
					{ name: 'Get Users', value: 'users', action: 'Get users' },
				],
				default: 'accounts',
			},
			{
				displayName: 'Account Name or ID',
				name: 'templatesAccountId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getWhatsappAccounts' },
				default: '',
				description: 'Opcional: solo las de esta cuenta. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: show('workspace', ['templates']),
			},
		],
	};

	methods = {
		loadOptions: { getAccounts, getWhatsappAccounts, getTags, getUsers, getTeams, getTemplates, getRunnableAutomations },
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const result = await runOperation.call(this, resource, operation, i);
				const rows = Array.isArray(result) ? result : [result];
				out.push(...this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(rows as IDataObject[]), { itemData: { item: i } }));
			} catch (error) {
				if (this.continueOnFail()) {
					out.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				// Los errores de la API ya traen su mensaje en español y el requestId.
				if (error instanceof NodeApiError) throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i, message: error.message, description: error.description ?? undefined });
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}
		return [out];
	}
}

async function runOperation(this: IExecuteFunctions, resource: string, operation: string, i: number): Promise<IDataObject | IDataObject[]> {
	const enc = encodeURIComponent;

	if (resource === 'contact') {
		if (operation === 'get') return coliblyApiRequest.call(this, 'GET', `/contacts/${enc(this.getNodeParameter('contactId', i) as string)}`);
		if (operation === 'getAll') {
			const returnAll = this.getNodeParameter('returnAll', i) as boolean;
			const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
			return coliblyApiRequestAllItems.call(this, '/contacts', this.getNodeParameter('filters', i, {}) as IDataObject, limit);
		}
		if (operation === 'create') {
			const extra = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
			const body: IDataObject = {
				accountId: this.getNodeParameter('accountId', i) as string,
				phone: this.getNodeParameter('phone', i) as string,
			};
			if (extra.name) body.name = extra.name;
			if (extra.leadStatus) body.leadStatus = extra.leadStatus;
			if (extra.tags) body.tags = String(extra.tags).split(',').map((t) => t.trim()).filter(Boolean);
			const customFields = customFieldsFrom(this.getNodeParameter('customFields', i, {}) as IDataObject);
			if (customFields) body.customFields = customFields;
			return coliblyApiRequest.call(this, 'POST', '/contacts', body);
		}
		if (operation === 'update') {
			const fields = this.getNodeParameter('updateFields', i, {}) as IDataObject;
			const body: IDataObject = {};
			if (fields.name) body.name = fields.name;
			if (fields.realName) body.realName = fields.realName;
			if (fields.leadStatus) body.leadStatus = fields.leadStatus;
			if (fields.dealValue !== undefined) body.dealValueCents = Math.round(Number(fields.dealValue) * 100);
			if (fields.expectedCloseAt) body.expectedCloseAt = new Date(fields.expectedCloseAt as string).toISOString();
			const customFields = customFieldsFrom(this.getNodeParameter('customFields', i, {}) as IDataObject);
			if (customFields) body.customFields = customFields;
			if (!Object.keys(body).length) throw new NodeOperationError(this.getNode(), 'Elige al menos un campo para actualizar', { itemIndex: i });
			return coliblyApiRequest.call(this, 'PATCH', `/contacts/${enc(this.getNodeParameter('contactId', i) as string)}`, body);
		}
		if (operation === 'addTag') {
			const mode = this.getNodeParameter('tagMode', i) as string;
			const body = mode === 'id' ? { tagId: this.getNodeParameter('tagId', i) as string } : { name: this.getNodeParameter('tagName', i) as string };
			return coliblyApiRequest.call(this, 'POST', `/contacts/${enc(this.getNodeParameter('contactId', i) as string)}/tags`, body);
		}
		if (operation === 'removeTag') {
			return coliblyApiRequest.call(this, 'DELETE', `/contacts/${enc(this.getNodeParameter('contactId', i) as string)}/tags`, undefined, {
				tagId: this.getNodeParameter('removeTagId', i) as string,
			});
		}
	}

	if (resource === 'conversation') {
		if (operation === 'get') return coliblyApiRequest.call(this, 'GET', `/conversations/${enc(this.getNodeParameter('conversationId', i) as string)}`);
		if (operation === 'getAll' || operation === 'getMessages') {
			const returnAll = this.getNodeParameter('returnAll', i) as boolean;
			const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
			if (operation === 'getMessages') {
				return coliblyApiRequestAllItems.call(this, `/conversations/${enc(this.getNodeParameter('conversationId', i) as string)}/messages`, {}, limit);
			}
			return coliblyApiRequestAllItems.call(this, '/conversations', this.getNodeParameter('conversationFilters', i, {}) as IDataObject, limit);
		}
		if (operation === 'update') {
			const fields = this.getNodeParameter('conversationUpdate', i, {}) as IDataObject;
			const body: IDataObject = {};
			if (fields.status) body.status = fields.status;
			if ('assignedToId' in fields) body.assignedToId = fields.assignedToId || null;
			if ('teamId' in fields) body.teamId = fields.teamId || null;
			if (!Object.keys(body).length) throw new NodeOperationError(this.getNode(), 'Elige el estado, la persona asignada o el equipo', { itemIndex: i });
			return coliblyApiRequest.call(this, 'PATCH', `/conversations/${enc(this.getNodeParameter('conversationId', i) as string)}`, body);
		}
	}

	if (resource === 'message') {
		if (operation === 'get') return coliblyApiRequest.call(this, 'GET', `/messages/${enc(this.getNodeParameter('messageId', i) as string)}`);
		if (operation === 'send') {
			const target = this.getNodeParameter('target', i) as string;
			const type = this.getNodeParameter('type', i) as string;
			const body: IDataObject = { type };
			if (target === 'contact') body.contactId = this.getNodeParameter('sendContactId', i) as string;
			else body.conversationId = this.getNodeParameter('sendConversationId', i) as string;
			if (type === 'text' || type === 'buttons') body.text = this.getNodeParameter('text', i) as string;
			if (type === 'buttons') {
				const buttons = ((this.getNodeParameter('buttons', i, {}) as IDataObject).button as IDataObject[] | undefined) ?? [];
				body.buttons = buttons.filter((b) => b.title).map((b) => ({ title: b.title, ...(b.id ? { id: b.id } : {}) }));
			}
			if (type === 'template') {
				const p = this.getNodeParameter('templateParams', i, {}) as IDataObject;
				body.template = {
					id: this.getNodeParameter('templateId', i) as string,
					...(p.bodyParams ? { bodyParams: String(p.bodyParams).split('|').map((v) => v.trim()) } : {}),
					...(p.headerParam ? { headerParam: p.headerParam } : {}),
					...(p.buttonParam ? { buttonParam: p.buttonParam } : {}),
				};
			}
			if (['image', 'document', 'audio', 'video'].includes(type)) {
				const opts = this.getNodeParameter('mediaOptions', i, {}) as IDataObject;
				body.media = {
					url: this.getNodeParameter('mediaUrl', i) as string,
					...(opts.filename ? { filename: opts.filename } : {}),
					...(opts.mimeType ? { mimeType: opts.mimeType } : {}),
				};
				if (opts.caption && type !== 'audio') body.caption = opts.caption;
			}
			// Reintentar el flujo no duplica el envío (Idempotency-Key por ejecución e ítem).
			const key = idempotencyKey(this.getExecutionId(), this.getNode().name, i);
			return coliblyApiRequest.call(this, 'POST', '/messages', body, undefined, { 'Idempotency-Key': key });
		}
	}

	if (resource === 'automation') {
		if (operation === 'getAll') {
			const onlyRunnable = this.getNodeParameter('onlyRunnable', i) as boolean;
			return coliblyList.call(this, '/automations', onlyRunnable ? { runnable: 'true' } : undefined);
		}
		if (operation === 'run') {
			const vars = ((this.getNodeParameter('vars', i, {}) as IDataObject).variable as IDataObject[] | undefined) ?? [];
			const body: IDataObject = { contactId: this.getNodeParameter('runContactId', i) as string };
			const filtered = vars.filter((v) => v.name);
			if (filtered.length) body.vars = Object.fromEntries(filtered.map((v) => [v.name as string, String(v.value ?? '')]));
			const key = idempotencyKey(this.getExecutionId(), this.getNode().name, i);
			return coliblyApiRequest.call(this, 'POST', `/automations/${enc(this.getNodeParameter('automationId', i) as string)}/runs`, body, undefined, { 'Idempotency-Key': key });
		}
	}

	if (resource === 'workspace') {
		if (operation === 'me') return coliblyApiRequest.call(this, 'GET', '/me');
		if (operation === 'templates') {
			const accountId = this.getNodeParameter('templatesAccountId', i, '') as string;
			return coliblyList.call(this, '/templates', accountId ? { accountId } : undefined);
		}
		return coliblyList.call(this, `/${operation}`);
	}

	throw new NodeOperationError(this.getNode(), `Operación no soportada: ${resource}.${operation}`, { itemIndex: i });
}
