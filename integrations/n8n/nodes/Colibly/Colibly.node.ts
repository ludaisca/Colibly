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
	getAllTemplates,
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

/** Parámetro tipo JSON (texto u objeto) → objeto; vacío = undefined. */
function jsonParam(ctx: IExecuteFunctions, name: string, i: number): IDataObject | undefined {
	const raw = ctx.getNodeParameter(name, i, '') as string | IDataObject;
	if (raw === '' || raw === undefined || raw === null) return undefined;
	if (typeof raw === 'object') return raw;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new NodeOperationError(ctx.getNode(), `El campo ${name} no es JSON válido: ${(error as Error).message}`, { itemIndex: i });
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new NodeOperationError(ctx.getNode(), `El campo ${name} debe ser un objeto JSON`, { itemIndex: i });
	}
	return parsed as IDataObject;
}

const json = (displayName: string, name: string, displayOptions: INodeProperties['displayOptions'], description: string, required = true): INodeProperties => ({
	displayName,
	name,
	type: 'json',
	default: '',
	required,
	description,
	displayOptions,
});

const WA_ACCOUNT = (operations: string[]): INodeProperties => ({
	displayName: 'WhatsApp Account Name or ID',
	name: 'waAccountId',
	type: 'options',
	typeOptions: { loadOptionsMethod: 'getWhatsappAccounts' },
	required: true,
	default: '',
	description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	displayOptions: show('whatsapp', operations),
});

export class Colibly implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Colibly',
		name: 'colibly',
		icon: { light: 'file:colibly.svg', dark: 'file:colibly.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Contactos, conversaciones, mensajes, plantillas, llamadas y administración de WhatsApp en Colibly',
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
					{ name: 'Call', value: 'call', description: 'Llamadas de WhatsApp' },
					{ name: 'Contact', value: 'contact' },
					{ name: 'Conversation', value: 'conversation' },
					{ name: 'Media', value: 'media', description: 'Archivos para reusar en varios envíos' },
					{ name: 'Message', value: 'message' },
					{ name: 'Template', value: 'template', description: 'Plantillas de WhatsApp: crear, editar, borrar y métricas' },
					{ name: 'WhatsApp', value: 'whatsapp', description: 'Perfil, bloqueos, QR, costos, catálogo y Flows del número' },
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
					{ name: 'React', value: 'react', action: 'React to a message', description: 'Emoji sobre un mensaje de WhatsApp ("" la quita)' },
					{ name: 'Send', value: 'send', action: 'Send a message', description: 'Texto, botones, lista, plantilla, archivo, ubicación, Flow, catálogo…' },
				],
				default: 'send',
			},
			{
				displayName: 'Message ID',
				name: 'messageId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: show('message', ['get', 'react']),
			},
			{
				displayName: 'Emoji',
				name: 'emoji',
				type: 'string',
				default: '👍',
				description: 'Un solo emoji; vacío quita la reacción',
				displayOptions: show('message', ['react']),
			},
			{
				displayName: 'Send To',
				name: 'target',
				type: 'options',
				options: [
					{ name: 'Contact', value: 'contact' },
					{ name: 'Conversation', value: 'conversation' },
					{ name: 'Phone Number', value: 'phone', description: 'Número de WhatsApp: crea el contacto si hace falta (solo con plantilla)' },
				],
				default: 'contact',
				displayOptions: show('message', ['send']),
			},
			{
				displayName: 'WhatsApp Account Name or ID',
				name: 'sendAccountId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getWhatsappAccounts' },
				required: true,
				default: '',
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				displayOptions: { show: { resource: ['message'], operation: ['send'], target: ['phone'] } },
			},
			{
				displayName: 'Phone',
				name: 'sendTo',
				type: 'string',
				required: true,
				default: '',
				placeholder: '5215512345678',
				description: 'Con código de país; 10 dígitos sin + se toman como México',
				displayOptions: { show: { resource: ['message'], operation: ['send'], target: ['phone'] } },
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
					{ name: 'Advanced (JSON)', value: 'json', description: 'Cualquier tipo de POST /messages: product_list, contacts, plantillas de carrusel…' },
					{ name: 'Audio', value: 'audio' },
					{ name: 'Button With URL', value: 'cta_url', description: 'Texto con un botón que abre una URL (WhatsApp)' },
					{ name: 'Buttons', value: 'buttons', description: 'Texto con hasta 3 botones de respuesta' },
					{ name: 'Catalog', value: 'catalog', description: 'Botón «Ver catálogo» (WhatsApp)' },
					{ name: 'Document', value: 'document' },
					{ name: 'Flow', value: 'flow', description: 'Formulario de WhatsApp Flows' },
					{ name: 'Image', value: 'image' },
					{ name: 'List', value: 'list', description: 'Texto con un menú de hasta 10 opciones' },
					{ name: 'Location', value: 'location', description: 'Un punto en el mapa (WhatsApp)' },
					{ name: 'Location Request', value: 'location_request', description: 'Pide al cliente su ubicación (WhatsApp)' },
					{ name: 'Product', value: 'product', description: 'Un producto del catálogo (WhatsApp)' },
					{ name: 'Sticker', value: 'sticker', description: 'WebP de 512×512 (WhatsApp)' },
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
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['text', 'buttons', 'list', 'cta_url', 'location_request', 'flow', 'catalog'] } },
			},
			{
				displayName: 'Message Fields (JSON)',
				name: 'messageJson',
				type: 'json',
				required: true,
				default: '{\n  "type": "contacts",\n  "contacts": [{ "name": "Laura Gómez", "phones": [{ "phone": "+52 55 1234 5678" }] }]\n}',
				description: 'Campos de POST /messages (type y los suyos); el destino lo pone «Send To»',
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['json'] } },
			},
			{
				displayName: 'List Button',
				name: 'listButton',
				type: 'string',
				required: true,
				default: 'Ver opciones',
				description: 'Texto del botón que abre la lista (20 caracteres)',
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['list'] } },
			},
			{
				displayName: 'List Options',
				name: 'listRows',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Add Option',
				default: {},
				description: 'Hasta 10 opciones',
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['list'] } },
				options: [
					{
						name: 'row',
						displayName: 'Option',
						values: [
							{ displayName: 'Title', name: 'title', type: 'string', default: '' },
							{ displayName: 'Description', name: 'description', type: 'string', default: '' },
							{ displayName: 'ID', name: 'id', type: 'string', default: '', description: 'Opcional; llega en la respuesta del cliente' },
						],
					},
				],
			},
			{
				displayName: 'Button Label',
				name: 'ctaLabel',
				type: 'string',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['cta_url'] } },
			},
			{
				displayName: 'Button URL',
				name: 'ctaUrl',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'https://...',
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['cta_url'] } },
			},
			{
				displayName: 'Latitude',
				name: 'latitude',
				type: 'number',
				typeOptions: { numberPrecision: 6 },
				required: true,
				default: 0,
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['location'] } },
			},
			{
				displayName: 'Longitude',
				name: 'longitude',
				type: 'number',
				typeOptions: { numberPrecision: 6 },
				required: true,
				default: 0,
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['location'] } },
			},
			{
				displayName: 'Location Options',
				name: 'locationOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['location'] } },
				options: [
					{ displayName: 'Name', name: 'name', type: 'string', default: '' },
					{ displayName: 'Address', name: 'address', type: 'string', default: '' },
				],
			},
			{
				displayName: 'Product Retailer ID',
				name: 'productId',
				type: 'string',
				required: true,
				default: '',
				description: '«ID de contenido» del producto en Commerce Manager',
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['product'] } },
			},
			{
				displayName: 'Flow ID',
				name: 'flowId',
				type: 'string',
				required: true,
				default: '',
				description: 'De WhatsApp → Get Flows',
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['flow'] } },
			},
			{
				displayName: 'Flow Button',
				name: 'flowCta',
				type: 'string',
				required: true,
				default: 'Abrir',
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['flow'] } },
			},
			{
				displayName: 'Flow Options',
				name: 'flowOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['flow'] } },
				options: [
					{ displayName: 'Draft', name: 'draft', type: 'boolean', default: false, description: 'Whether to send a DRAFT flow to test it' },
					{ displayName: 'First Screen', name: 'screen', type: 'string', default: '' },
					{ displayName: 'Flow Reference', name: 'reference', type: 'string', default: '', description: 'Se manda como flow.token y vuelve en flow.completed para cruzar la respuesta; por omisión Colibly genera uno' },
					{ displayName: 'Header', name: 'header', type: 'string', default: '' },
					{ displayName: 'Initial Data (JSON)', name: 'data', type: 'json', default: '' },
				],
			},
			{
				displayName: 'Product Options',
				name: 'productOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['product', 'catalog'] } },
				options: [
					{ displayName: 'Catalog ID', name: 'catalogId', type: 'string', default: '', description: 'Solo si la cuenta tiene varios catálogos (o es de coexistencia)' },
					{ displayName: 'Footer', name: 'footer', type: 'string', default: '' },
					{ displayName: 'Text', name: 'text', type: 'string', default: '' },
					{ displayName: 'Thumbnail Product ID', name: 'thumbnailProductId', type: 'string', default: '', description: 'Catálogo: producto de la miniatura' },
				],
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
					{ displayName: 'Advanced (JSON)', name: 'advanced', type: 'json', default: '', description: 'Más campos de template: buttons (payload, couponCode…), code (OTP), offerExpiresAt, cards (carrusel), headerLocation' },
					{ displayName: 'Body Parameters', name: 'bodyParams', type: 'string', default: '', description: 'Valores de {{1}}, {{2}}… en orden, separados por |; o un objeto JSON {"nombre": "Ana"} para variables con nombre' },
					{ displayName: 'Button Parameter', name: 'buttonParam', type: 'string', default: '', description: 'Sufijo del botón con URL dinámica' },
					{ displayName: 'Code (Authentication)', name: 'code', type: 'string', default: '', description: 'Código de verificación de una plantilla AUTHENTICATION' },
					{ displayName: 'Header Parameter', name: 'headerParam', type: 'string', default: '', description: 'Texto de la cabecera, URL https o media ID (Media → Upload)' },
				],
			},
			{
				displayName: 'File URL or Media ID',
				name: 'mediaUrl',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'https://... o cmmed_…',
				description: 'URL pública https del archivo, o el ID de Media → Upload para reusarlo',
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['image', 'document', 'audio', 'video', 'sticker'] } },
			},
			{
				displayName: 'Reply To Message ID',
				name: 'replyTo',
				type: 'string',
				default: '',
				description: 'Opcional (WhatsApp): cita ese mensaje de la misma conversación',
				displayOptions: show('message', ['send']),
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

			// ── WhatsApp (administración del número) ──
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['whatsapp'] } },
				options: [
					{ name: 'Block Users', value: 'block', action: 'Block users' },
					{ name: 'Create Flow', value: 'createFlow', action: 'Create a flow' },
					{ name: 'Create Onboarding Link', value: 'createLink', action: 'Create a link to connect a number', description: 'Tu cliente conecta su número con su Facebook, sin cuenta en Colibly' },
					{ name: 'Create QR Code', value: 'createQr', action: 'Create a QR code' },
					{ name: 'Delete QR Code', value: 'deleteQr', action: 'Delete a QR code' },
					{ name: 'Get Blocked Users', value: 'getBlocked', action: 'Get blocked users' },
					{ name: 'Get Catalog', value: 'getCatalog', action: 'Get the catalog settings' },
					{ name: 'Get Conversational Automation', value: 'getAutomation', action: 'Get prompts commands and welcome message' },
					{ name: 'Get Costs', value: 'getCosts', action: 'Get messaging costs' },
					{ name: 'Get Flow', value: 'getFlow', action: 'Get a flow' },
					{ name: 'Get Flows', value: 'getFlows', action: 'Get flows' },
					{ name: 'Get Health', value: 'getHealth', action: 'Get number health', description: 'Calidad, límite de envío y avisos de Meta' },
					{ name: 'Get Onboarding Link', value: 'getLink', action: 'Get an onboarding link' },
					{ name: 'Get Phone Numbers', value: 'getNumbers', action: 'Get phone numbers' },
					{ name: 'Get Profile', value: 'getProfile', action: 'Get the business profile' },
					{ name: 'Get QR Codes', value: 'getQr', action: 'Get QR codes' },
					{ name: 'Publish Flow', value: 'publishFlow', action: 'Publish a flow' },
					{ name: 'Register Number', value: 'register', action: 'Register the number' },
					{ name: 'Set Two-Step PIN', value: 'setPin', action: 'Set the two step verification pin' },
					{ name: 'Unblock User', value: 'unblock', action: 'Unblock a user' },
					{ name: 'Update Conversational Automation', value: 'updateAutomation', action: 'Update prompts commands and welcome message' },
					{ name: 'Update Profile', value: 'updateProfile', action: 'Update the business profile' },
				],
				default: 'getHealth',
			},
			WA_ACCOUNT(['block', 'createFlow', 'createQr', 'deleteQr', 'getBlocked', 'getCatalog', 'getAutomation', 'getCosts', 'getFlow', 'getFlows', 'getHealth', 'getNumbers', 'getProfile', 'getQr', 'publishFlow', 'register', 'setPin', 'unblock', 'updateAutomation', 'updateProfile']),
			{
				displayName: 'PIN',
				name: 'pin',
				type: 'string',
				typeOptions: { password: true },
				required: true,
				default: '',
				description: '6 dígitos. En Register Number puede ir vacío: se usa el guardado.',
				displayOptions: show('whatsapp', ['setPin', 'register']),
			},
			{
				displayName: 'Link Options',
				name: 'linkOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: show('whatsapp', ['createLink']),
				options: [
					{ displayName: 'Account Name', name: 'name', type: 'string', default: '', description: 'Nombre de la cuenta que se creará' },
					{ displayName: 'Expires In (Hours)', name: 'expiresInHours', type: 'number', typeOptions: { minValue: 1, maxValue: 720 }, default: 72 },
					{ displayName: 'Redirect URL', name: 'redirectUrl', type: 'string', default: '', description: 'A dónde vuelve tu cliente al terminar (https)' },
					{ displayName: 'Reference', name: 'reference', type: 'string', default: '', description: 'Tu ID del cliente; vuelve en el evento Account Connected' },
				],
			},
			{
				displayName: 'Link ID',
				name: 'linkId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: show('whatsapp', ['getLink']),
			},
			{
				displayName: 'Phones',
				name: 'phones',
				type: 'string',
				required: true,
				default: '',
				description: 'Separados por comas, con código de país',
				displayOptions: show('whatsapp', ['block', 'unblock']),
			},
			{
				displayName: 'Prefilled Message',
				name: 'prefilledMessage',
				type: 'string',
				required: true,
				default: '',
				description: 'Lo que aparece escrito al escanear (140 caracteres)',
				displayOptions: show('whatsapp', ['createQr']),
			},
			{
				displayName: 'QR Code',
				name: 'qrCode',
				type: 'string',
				required: true,
				default: '',
				displayOptions: show('whatsapp', ['deleteQr']),
			},
			{
				displayName: 'Flow ID',
				name: 'waFlowId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: show('whatsapp', ['getFlow', 'publishFlow']),
			},
			{
				displayName: 'Since',
				name: 'since',
				type: 'dateTime',
				default: '',
				description: 'Por omisión, hace 30 días',
				displayOptions: show('whatsapp', ['getCosts']),
			},
			{
				displayName: 'Until',
				name: 'until',
				type: 'dateTime',
				default: '',
				displayOptions: show('whatsapp', ['getCosts']),
			},
			json('Profile (JSON)', 'profileJson', show('whatsapp', ['updateProfile']), 'about, address, description, email, websites, vertical, profilePictureUrl'),
			json('Conversational Automation (JSON)', 'automationJson', show('whatsapp', ['updateAutomation']), 'prompts (hasta 4), commands ([{ name, description }]) y/o welcomeMessage ({ enabled, text })'),
			json('Flow (JSON)', 'flowJson', show('whatsapp', ['createFlow']), 'name, categories, flowJson y opcionalmente publish, endpointUri o useColiblyEndpoint'),

			// ── Plantillas ──
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['template'] } },
				options: [
					{ name: 'Create', value: 'create', action: 'Create a template', description: 'La manda a revisión de Meta' },
					{ name: 'Delete', value: 'delete', action: 'Delete a template' },
					{ name: 'Edit', value: 'edit', action: 'Edit a template', description: 'Vuelve a revisión' },
					{ name: 'Get', value: 'get', action: 'Get a template' },
					{ name: 'Get Analytics', value: 'analytics', action: 'Get template analytics' },
					{ name: 'Get Many', value: 'getAll', action: 'Get many templates' },
				],
				default: 'getAll',
			},
			{
				displayName: 'Template Name or ID',
				name: 'tplId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getAllTemplates' },
				required: true,
				default: '',
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				displayOptions: show('template', ['delete', 'edit', 'get', 'analytics']),
			},
			json(
				'Template (JSON)',
				'templateJson',
				show('template', ['create']),
				'accountId, name, language, category y components (body, bodyExamples, header, footer, buttons, limitedTimeOffer, carousel, authentication)',
			),
			json('Changes (JSON)', 'templateEditJson', show('template', ['edit']), 'components (y category si no está aprobada)'),

			// ── Archivos ──
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['media'] } },
				options: [
					{ name: 'Delete', value: 'delete', action: 'Delete an uploaded file' },
					{ name: 'Upload', value: 'upload', action: 'Upload a file from a URL', description: 'Devuelve un ID para reusarlo 30 días' },
				],
				default: 'upload',
			},
			{
				displayName: 'File Type',
				name: 'mediaType',
				type: 'options',
				options: [
					{ name: 'Audio', value: 'audio' },
					{ name: 'Document', value: 'document' },
					{ name: 'Image', value: 'image' },
					{ name: 'Sticker', value: 'sticker' },
					{ name: 'Video', value: 'video' },
				],
				default: 'image',
				displayOptions: show('media', ['upload']),
			},
			{
				displayName: 'File URL',
				name: 'uploadUrl',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'https://...',
				displayOptions: show('media', ['upload']),
			},
			{
				displayName: 'Media ID',
				name: 'mediaId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: show('media', ['delete']),
			},

			// ── Llamadas ──
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['call'] } },
				options: [
					{ name: 'Get', value: 'get', action: 'Get a call' },
					{ name: 'Get Many', value: 'getAll', action: 'Get many calls' },
				],
				default: 'getAll',
			},
			{
				displayName: 'Call ID',
				name: 'callId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: show('call', ['get']),
			},
			...returnAllFields('call', 'getAll'),
			{
				displayName: 'Filters',
				name: 'callFilters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: show('call', ['getAll']),
				options: [
					{ displayName: 'Account Name or ID', name: 'accountId', type: 'options', typeOptions: { loadOptionsMethod: 'getWhatsappAccounts' }, default: '', description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>' },
					{ displayName: 'Contact ID', name: 'contactId', type: 'string', default: '' },
					{
						displayName: 'Direction',
						name: 'direction',
						type: 'options',
						options: [
							{ name: 'Inbound', value: 'inbound' },
							{ name: 'Outbound', value: 'outbound' },
						],
						default: 'inbound',
					},
					{ displayName: 'Since', name: 'since', type: 'dateTime', default: '' },
					{
						displayName: 'Status',
						name: 'status',
						type: 'options',
						options: [
							{ name: 'Ended', value: 'ENDED' },
							{ name: 'Failed', value: 'FAILED' },
							{ name: 'Missed', value: 'MISSED' },
							{ name: 'Rejected', value: 'REJECTED' },
						],
						default: 'MISSED',
					},
				],
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
		loadOptions: { getAccounts, getWhatsappAccounts, getTags, getUsers, getTeams, getTemplates, getAllTemplates, getRunnableAutomations },
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
		if (operation === 'react') {
			const key = idempotencyKey(this.getExecutionId(), this.getNode().name, i);
			return coliblyApiRequest.call(this, 'POST', `/messages/${enc(this.getNodeParameter('messageId', i) as string)}/reaction`, { emoji: this.getNodeParameter('emoji', i, '') as string }, undefined, {
				'Idempotency-Key': key,
			});
		}
		if (operation === 'send') {
			const target = this.getNodeParameter('target', i) as string;
			const type = this.getNodeParameter('type', i) as string;
			let body: IDataObject = { type };
			if (type === 'json') body = { ...(jsonParam(this, 'messageJson', i) ?? {}) };
			if (target === 'contact') body.contactId = this.getNodeParameter('sendContactId', i) as string;
			else if (target === 'conversation') body.conversationId = this.getNodeParameter('sendConversationId', i) as string;
			else {
				body.accountId = this.getNodeParameter('sendAccountId', i) as string;
				body.to = this.getNodeParameter('sendTo', i) as string;
			}
			const replyTo = this.getNodeParameter('replyTo', i, '') as string;
			if (replyTo) body.replyTo = replyTo;
			if (['text', 'buttons', 'list', 'cta_url', 'location_request', 'flow', 'catalog'].includes(type)) body.text = this.getNodeParameter('text', i) as string;
			if (type === 'buttons') {
				const buttons = ((this.getNodeParameter('buttons', i, {}) as IDataObject).button as IDataObject[] | undefined) ?? [];
				body.buttons = buttons.filter((b) => b.title).map((b) => ({ title: b.title, ...(b.id ? { id: b.id } : {}) }));
			}
			if (type === 'list') {
				const rows = ((this.getNodeParameter('listRows', i, {}) as IDataObject).row as IDataObject[] | undefined) ?? [];
				body.list = {
					button: this.getNodeParameter('listButton', i) as string,
					rows: rows.filter((r) => r.title).map((r) => ({ title: r.title, ...(r.description ? { description: r.description } : {}), ...(r.id ? { id: r.id } : {}) })),
				};
			}
			if (type === 'cta_url') body.cta = { label: this.getNodeParameter('ctaLabel', i) as string, url: this.getNodeParameter('ctaUrl', i) as string };
			if (type === 'location') {
				const opts = this.getNodeParameter('locationOptions', i, {}) as IDataObject;
				body.location = {
					latitude: this.getNodeParameter('latitude', i) as number,
					longitude: this.getNodeParameter('longitude', i) as number,
					...(opts.name ? { name: opts.name } : {}),
					...(opts.address ? { address: opts.address } : {}),
				};
			}
			if (type === 'product' || type === 'catalog') {
				const opts = this.getNodeParameter('productOptions', i, {}) as IDataObject;
				if (type === 'product') {
					body.product = { id: this.getNodeParameter('productId', i) as string, ...(opts.catalogId ? { catalogId: opts.catalogId } : {}) };
					if (opts.text) body.text = opts.text;
				} else if (opts.thumbnailProductId) {
					body.catalog = { thumbnailProductId: opts.thumbnailProductId };
				}
				if (opts.footer) body.footer = opts.footer;
			}
			if (type === 'flow') {
				const opts = this.getNodeParameter('flowOptions', i, {}) as IDataObject;
				let data: IDataObject | undefined;
				if (opts.data) data = typeof opts.data === 'string' ? (JSON.parse(opts.data) as IDataObject) : (opts.data as IDataObject);
				body.flow = {
					id: this.getNodeParameter('flowId', i) as string,
					cta: this.getNodeParameter('flowCta', i) as string,
					...(opts.screen ? { screen: opts.screen } : {}),
					...(opts.header ? { header: opts.header } : {}),
					...(opts.reference ? { token: opts.reference } : {}),
					...(opts.draft ? { draft: true } : {}),
					...(data ? { data } : {}),
				};
			}
			if (type === 'template') {
				const p = this.getNodeParameter('templateParams', i, {}) as IDataObject;
				let bodyParams: unknown;
				if (p.bodyParams) {
					const raw = String(p.bodyParams).trim();
					bodyParams = raw.startsWith('{') ? JSON.parse(raw) : raw.split('|').map((v) => v.trim());
				}
				let advanced: IDataObject = {};
				if (p.advanced) advanced = typeof p.advanced === 'string' ? (JSON.parse(p.advanced) as IDataObject) : (p.advanced as IDataObject);
				body.template = {
					id: this.getNodeParameter('templateId', i) as string,
					...(bodyParams ? { bodyParams } : {}),
					...(p.headerParam ? { headerParam: p.headerParam } : {}),
					...(p.buttonParam ? { buttonParam: p.buttonParam } : {}),
					...(p.code ? { code: p.code } : {}),
					...advanced,
				};
			}
			if (['image', 'document', 'audio', 'video', 'sticker'].includes(type)) {
				const source = (this.getNodeParameter('mediaUrl', i) as string).trim();
				const opts = type === 'sticker' ? {} : (this.getNodeParameter('mediaOptions', i, {}) as IDataObject);
				body.media = {
					...(/^https?:\/\//i.test(source) ? { url: source } : { id: source }),
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

	if (resource === 'whatsapp' && (operation === 'createLink' || operation === 'getLink')) {
		if (operation === 'getLink') return coliblyApiRequest.call(this, 'GET', `/onboarding-links/${enc(this.getNodeParameter('linkId', i) as string)}`);
		const opts = this.getNodeParameter('linkOptions', i, {}) as IDataObject;
		const body: IDataObject = {};
		for (const k of ['name', 'reference', 'redirectUrl', 'expiresInHours']) if (opts[k] !== undefined && opts[k] !== '') body[k] = opts[k];
		const key = idempotencyKey(this.getExecutionId(), this.getNode().name, i);
		return coliblyApiRequest.call(this, 'POST', '/onboarding-links', body, undefined, { 'Idempotency-Key': key });
	}

	if (resource === 'whatsapp') {
		const account = enc(this.getNodeParameter('waAccountId', i) as string);
		const base = `/accounts/${account}`;
		switch (operation) {
			case 'getHealth':
				return coliblyApiRequest.call(this, 'GET', base);
			case 'getProfile':
				return coliblyApiRequest.call(this, 'GET', `${base}/profile`);
			case 'updateProfile':
				return coliblyApiRequest.call(this, 'PATCH', `${base}/profile`, jsonParam(this, 'profileJson', i));
			case 'getBlocked':
				return coliblyApiRequest.call(this, 'GET', `${base}/blocked-users`);
			case 'block': {
				const phones = String(this.getNodeParameter('phones', i)).split(',').map((v) => v.trim()).filter(Boolean);
				return coliblyApiRequest.call(this, 'POST', `${base}/blocked-users`, { phones });
			}
			case 'unblock': {
				const phone = String(this.getNodeParameter('phones', i)).split(',')[0].trim();
				return coliblyApiRequest.call(this, 'DELETE', `${base}/blocked-users/${enc(phone)}`);
			}
			case 'getAutomation':
				return coliblyApiRequest.call(this, 'GET', `${base}/conversational-automation`);
			case 'updateAutomation':
				return coliblyApiRequest.call(this, 'PATCH', `${base}/conversational-automation`, jsonParam(this, 'automationJson', i));
			case 'getQr':
				return coliblyList.call(this, `${base}/qr-codes`);
			case 'createQr':
				return coliblyApiRequest.call(this, 'POST', `${base}/qr-codes`, { prefilledMessage: this.getNodeParameter('prefilledMessage', i) as string });
			case 'deleteQr':
				return coliblyApiRequest.call(this, 'DELETE', `${base}/qr-codes/${enc(this.getNodeParameter('qrCode', i) as string)}`);
			case 'getCosts': {
				const since = this.getNodeParameter('since', i, '') as string;
				const until = this.getNodeParameter('until', i, '') as string;
				return coliblyApiRequest.call(this, 'GET', `${base}/analytics`, undefined, {
					since: since ? new Date(since).toISOString() : undefined,
					until: until ? new Date(until).toISOString() : undefined,
				});
			}
			case 'getCatalog':
				return coliblyApiRequest.call(this, 'GET', `${base}/catalog`);
			case 'getFlows':
				return coliblyList.call(this, `${base}/flows`);
			case 'getFlow':
				return coliblyApiRequest.call(this, 'GET', `${base}/flows/${enc(this.getNodeParameter('waFlowId', i) as string)}`);
			case 'createFlow':
				return coliblyApiRequest.call(this, 'POST', `${base}/flows`, jsonParam(this, 'flowJson', i));
			case 'getNumbers':
				return coliblyApiRequest.call(this, 'GET', `${base}/phone-numbers`);
			case 'setPin':
				return coliblyApiRequest.call(this, 'POST', `${base}/two-step-pin`, { pin: this.getNodeParameter('pin', i) as string });
			case 'register': {
				const pin = this.getNodeParameter('pin', i, '') as string;
				return coliblyApiRequest.call(this, 'POST', `${base}/register`, pin ? { pin } : undefined);
			}
			case 'publishFlow':
				return coliblyApiRequest.call(this, 'POST', `${base}/flows/${enc(this.getNodeParameter('waFlowId', i) as string)}/publish`);
		}
	}

	if (resource === 'template') {
		if (operation === 'getAll') return coliblyList.call(this, '/templates');
		if (operation === 'create') return coliblyApiRequest.call(this, 'POST', '/templates', jsonParam(this, 'templateJson', i));
		const id = enc(this.getNodeParameter('tplId', i) as string);
		if (operation === 'get') return coliblyApiRequest.call(this, 'GET', `/templates/${id}`);
		if (operation === 'edit') return coliblyApiRequest.call(this, 'PATCH', `/templates/${id}`, jsonParam(this, 'templateEditJson', i));
		if (operation === 'delete') return coliblyApiRequest.call(this, 'DELETE', `/templates/${id}`);
		if (operation === 'analytics') return coliblyApiRequest.call(this, 'GET', `/templates/${id}/analytics`);
	}

	if (resource === 'media') {
		if (operation === 'upload') {
			return coliblyApiRequest.call(this, 'POST', '/media', { type: this.getNodeParameter('mediaType', i) as string, url: this.getNodeParameter('uploadUrl', i) as string });
		}
		if (operation === 'delete') return coliblyApiRequest.call(this, 'DELETE', `/media/${enc(this.getNodeParameter('mediaId', i) as string)}`);
	}

	if (resource === 'call') {
		if (operation === 'get') return coliblyApiRequest.call(this, 'GET', `/calls/${enc(this.getNodeParameter('callId', i) as string)}`);
		if (operation === 'getAll') {
			const returnAll = this.getNodeParameter('returnAll', i) as boolean;
			const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
			const filters = { ...(this.getNodeParameter('callFilters', i, {}) as IDataObject) };
			if (filters.since) filters.since = new Date(filters.since as string).toISOString();
			return coliblyApiRequestAllItems.call(this, '/calls', filters, limit);
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
