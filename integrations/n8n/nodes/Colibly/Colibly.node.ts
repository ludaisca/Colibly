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
/* eslint-disable n8n-nodes-base/node-param-display-name-miscased, n8n-nodes-base/node-param-operation-option-action-miscased, n8n-nodes-base/node-param-display-name-wrong-for-dynamic-options, n8n-nodes-base/node-param-description-wrong-for-dynamic-options, n8n-nodes-base/node-param-description-boolean-without-whether, n8n-nodes-base/node-param-description-wrong-for-return-all, n8n-nodes-base/node-param-description-wrong-for-limit, n8n-nodes-base/node-param-display-name-wrong-for-update-fields, n8n-nodes-base/node-param-option-name-wrong-for-get-many */
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
		displayName: 'Devolver todo',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Devuelve todos los resultados o solo hasta el límite indicado',
		displayOptions: show(resource, [operation]),
	},
	{
		displayName: 'Límite',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Número máximo de resultados',
		displayOptions: { show: { resource: [resource], operation: [operation], returnAll: [false] } },
	},
];

const customFieldsCollection = (resource: string, operation: string[]): INodeProperties => ({
	displayName: 'Campos personalizados',
	name: 'customFields',
	type: 'fixedCollection',
	typeOptions: { multipleValues: true },
	placeholder: 'Agregar campo personalizado',
	default: {},
	description: 'Campos personalizados por su clave (key) en Colibly',
	displayOptions: show(resource, operation),
	options: [
		{
			name: 'field',
			displayName: 'Campo',
			values: [
				{ displayName: 'Clave', name: 'key', type: 'string', default: '' },
				{ displayName: 'Valor', name: 'value', type: 'string', default: '' },
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
	displayName: 'Cuenta de WhatsApp (nombre o ID)',
	name: 'waAccountId',
	type: 'options',
	typeOptions: { loadOptionsMethod: 'getWhatsappAccounts' },
	required: true,
	default: '',
	description: 'Elige de la lista o indica un ID con una <a href="https://docs.n8n.io/code/expressions/">expresión</a>',
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
				displayName: 'Recurso',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Automatización', value: 'automation' },
					{ name: 'Contacto', value: 'contact' },
					{ name: 'Conversación', value: 'conversation' },
					{ name: 'Espacio de trabajo', value: 'workspace', description: 'Cuentas, etiquetas, usuarios, equipos y plantillas' },
					{ name: 'Llamada', value: 'call', description: 'Llamadas de WhatsApp' },
					{ name: 'Medio', value: 'media', description: 'Archivos para reusar en varios envíos' },
					{ name: 'Mensaje', value: 'message' },
					{ name: 'Plantilla', value: 'template', description: 'Plantillas de WhatsApp: crear, editar, borrar y métricas' },
					{ name: 'WhatsApp', value: 'whatsapp', description: 'Perfil, bloqueos, QR, costos, catálogo y Flows del número' },
				],
				default: 'contact',
			},

			// ── Contacto ──
			{
				displayName: 'Operación',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['contact'] } },
				options: [
					{ name: 'Actualizar', value: 'update', action: 'Actualizar un contacto', description: 'Nombre, etapa, valor del trato o campos' },
					{ name: 'Agregar etiqueta', value: 'addTag', action: 'Agregar una etiqueta a un contacto', description: 'Agrega una etiqueta (la crea si no existe)' },
					{ name: 'Crear u obtener', value: 'create', action: 'Crear u obtener un contacto', description: 'Crea el contacto o devuelve el que ya tiene ese teléfono' },
					{ name: 'Listar', value: 'getAll', action: 'Listar contactos', description: 'Lista o busca contactos' },
					{ name: 'Obtener', value: 'get', action: 'Obtener un contacto' },
					{ name: 'Quitar etiqueta', value: 'removeTag', action: 'Quitar una etiqueta de un contacto' },
				],
				default: 'getAll',
			},
			{
				displayName: 'ID del contacto',
				name: 'contactId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: show('contact', ['get', 'update', 'addTag', 'removeTag']),
			},
			{
				displayName: 'Cuenta de WhatsApp (nombre o ID)',
				name: 'accountId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getWhatsappAccounts' },
				required: true,
				default: '',
				description: 'Número de WhatsApp al que pertenece el contacto (en los demás canales los contactos se crean solos cuando escriben). Elige de la lista o indica un ID con una <a href="https://docs.n8n.io/code/expressions/">expresión</a>.',
				displayOptions: show('contact', ['create']),
			},
			{
				displayName: 'Teléfono',
				name: 'phone',
				type: 'string',
				required: true,
				default: '',
				placeholder: '5215512345678',
				description: 'Con código de país, solo dígitos (se ignoran espacios y signos)',
				displayOptions: show('contact', ['create']),
			},
			{
				displayName: 'Campos adicionales',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Agregar campo',
				default: {},
				displayOptions: show('contact', ['create']),
				options: [
					{ displayName: 'Nombre', name: 'name', type: 'string', default: '' },
					{ displayName: 'Etapa del lead', name: 'leadStatus', type: 'options', options: LEAD_STATUS, default: 'NEW' },
					{ displayName: 'Etiquetas', name: 'tags', type: 'string', default: '', description: 'Nombres separados por comas; se crean si no existen' },
				],
			},
			{
				displayName: 'Campos a actualizar',
				name: 'updateFields',
				type: 'collection',
				placeholder: 'Agregar campo',
				default: {},
				displayOptions: show('contact', ['update']),
				options: [
					{ displayName: 'Etapa del lead', name: 'leadStatus', type: 'options', options: LEAD_STATUS, default: 'QUALIFIED' },
					{ displayName: 'Fecha estimada de cierre', name: 'expectedCloseAt', type: 'dateTime', default: '' },
					{ displayName: 'Nombre', name: 'name', type: 'string', default: '' },
					{ displayName: 'Nombre real', name: 'realName', type: 'string', default: '' },
					{ displayName: 'Valor del trato (MXN)', name: 'dealValue', type: 'number', typeOptions: { minValue: 0, numberPrecision: 2 }, default: 0, description: 'Valor del trato en pesos' },
				],
			},
			customFieldsCollection('contact', ['create', 'update']),
			{
				displayName: 'Etiqueta',
				name: 'tagMode',
				type: 'options',
				options: [
					{ name: 'Por nombre', value: 'name' },
					{ name: 'De la lista', value: 'id' },
				],
				default: 'name',
				displayOptions: show('contact', ['addTag']),
			},
			{
				displayName: 'Nombre de la etiqueta',
				name: 'tagName',
				type: 'string',
				required: true,
				default: '',
				description: 'Se crea en la cuenta del contacto si no existe',
				displayOptions: { show: { resource: ['contact'], operation: ['addTag'], tagMode: ['name'] } },
			},
			{
				displayName: 'Etiqueta (nombre o ID)',
				name: 'tagId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getTags' },
				required: true,
				default: '',
				description: 'Elige de la lista o indica un ID con una <a href="https://docs.n8n.io/code/expressions/">expresión</a>',
				displayOptions: { show: { resource: ['contact'], operation: ['addTag'], tagMode: ['id'] } },
			},
			{
				displayName: 'Etiqueta (nombre o ID)',
				name: 'removeTagId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getTags' },
				required: true,
				default: '',
				description: 'Elige de la lista o indica un ID con una <a href="https://docs.n8n.io/code/expressions/">expresión</a>',
				displayOptions: show('contact', ['removeTag']),
			},
			...returnAllFields('contact', 'getAll'),
			{
				displayName: 'Filtros',
				name: 'filters',
				type: 'collection',
				placeholder: 'Agregar filtro',
				default: {},
				displayOptions: show('contact', ['getAll']),
				options: [
					{ displayName: 'Actualizados desde', name: 'updatedSince', type: 'dateTime', default: '' },
					{ displayName: 'Buscar', name: 'q', type: 'string', default: '', description: 'Nombre o teléfono' },
					{ displayName: 'Cuenta (nombre o ID)', name: 'accountId', type: 'options', typeOptions: { loadOptionsMethod: 'getAccounts' }, default: '', description: 'Elige de la lista o indica un ID con una <a href="https://docs.n8n.io/code/expressions/">expresión</a>' },
					{ displayName: 'Etapa del lead', name: 'leadStatus', type: 'options', options: LEAD_STATUS, default: 'NEW' },
					{ displayName: 'Etiqueta (nombre o ID)', name: 'tagId', type: 'options', typeOptions: { loadOptionsMethod: 'getTags' }, default: '', description: 'Elige de la lista o indica un ID con una <a href="https://docs.n8n.io/code/expressions/">expresión</a>' },
				],
			},

			// ── Conversación ──
			{
				displayName: 'Operación',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['conversation'] } },
				options: [
					{ name: 'Obtener', value: 'get', action: 'Obtener una conversación' },
					{ name: 'Listar', value: 'getAll', action: 'Listar conversaciones' },
					{ name: 'Obtener mensajes', value: 'getMessages', action: 'Obtener los mensajes de una conversación' },
					{ name: 'Actualizar', value: 'update', action: 'Actualizar una conversación', description: 'Estado, persona asignada o equipo' },
				],
				default: 'getAll',
			},
			{
				displayName: 'ID de la conversación',
				name: 'conversationId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: show('conversation', ['get', 'getMessages', 'update']),
			},
			{
				displayName: 'Campos a actualizar',
				name: 'conversationUpdate',
				type: 'collection',
				placeholder: 'Agregar campo',
				default: {},
				displayOptions: show('conversation', ['update']),
				options: [
					{
						displayName: 'Estado',
						name: 'status',
						type: 'options',
						options: [
							{ name: 'Abierta', value: 'OPEN' },
							{ name: 'Pendiente', value: 'PENDING' },
							{ name: 'Resuelta', value: 'RESOLVED' },
						],
						default: 'RESOLVED',
					},
					{ displayName: 'Asignada a (nombre o ID)', name: 'assignedToId', type: 'options', typeOptions: { loadOptionsMethod: 'getUsers' }, default: '', description: 'Vacío = quitar la asignación. Elige de la lista o indica un ID con una <a href="https://docs.n8n.io/code/expressions/">expresión</a>.' },
					{ displayName: 'Equipo (nombre o ID)', name: 'teamId', type: 'options', typeOptions: { loadOptionsMethod: 'getTeams' }, default: '', description: 'Vacío = sacarla de su equipo. Elige de la lista o indica un ID con una <a href="https://docs.n8n.io/code/expressions/">expresión</a>.' },
				],
			},
			...returnAllFields('conversation', 'getAll'),
			...returnAllFields('conversation', 'getMessages'),
			{
				displayName: 'Filtros',
				name: 'conversationFilters',
				type: 'collection',
				placeholder: 'Agregar filtro',
				default: {},
				displayOptions: show('conversation', ['getAll']),
				options: [
					{ displayName: 'Asignada a (nombre o ID)', name: 'assignedToId', type: 'options', typeOptions: { loadOptionsMethod: 'getUsers' }, default: '', description: 'Elige de la lista o indica un ID con una <a href="https://docs.n8n.io/code/expressions/">expresión</a>' },
					{ displayName: 'Cuenta (nombre o ID)', name: 'accountId', type: 'options', typeOptions: { loadOptionsMethod: 'getAccounts' }, default: '', description: 'Elige de la lista o indica un ID con una <a href="https://docs.n8n.io/code/expressions/">expresión</a>' },
					{ displayName: 'Equipo (nombre o ID)', name: 'teamId', type: 'options', typeOptions: { loadOptionsMethod: 'getTeams' }, default: '', description: 'Elige de la lista o indica un ID con una <a href="https://docs.n8n.io/code/expressions/">expresión</a>' },
					{
						displayName: 'Estado',
						name: 'status',
						type: 'options',
						options: [
							{ name: 'Abierta', value: 'OPEN' },
							{ name: 'Pendiente', value: 'PENDING' },
							{ name: 'Resuelta', value: 'RESOLVED' },
						],
						default: 'OPEN',
					},
					{ displayName: 'ID del contacto', name: 'contactId', type: 'string', default: '' },
				],
			},

			// ── Mensaje ──
			{
				displayName: 'Operación',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['message'] } },
				options: [
					{ name: 'Obtener', value: 'get', action: 'Obtener un mensaje' },
					{ name: 'Reaccionar', value: 'react', action: 'Reaccionar a un mensaje', description: 'Emoji sobre un mensaje de WhatsApp ("" la quita)' },
					{ name: 'Enviar', value: 'send', action: 'Enviar un mensaje', description: 'Texto, botones, lista, plantilla, archivo, ubicación, Flow, catálogo…' },
				],
				default: 'send',
			},
			{
				displayName: 'ID del mensaje',
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
				displayName: 'Enviar a',
				name: 'target',
				type: 'options',
				options: [
					{ name: 'Contacto', value: 'contact' },
					{ name: 'Conversación', value: 'conversation' },
					{ name: 'Número de teléfono', value: 'phone', description: 'Número de WhatsApp: crea el contacto si hace falta (solo con plantilla)' },
				],
				default: 'contact',
				displayOptions: show('message', ['send']),
			},
			{
				displayName: 'Cuenta de WhatsApp (nombre o ID)',
				name: 'sendAccountId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getWhatsappAccounts' },
				required: true,
				default: '',
				description: 'Elige de la lista o indica un ID con una <a href="https://docs.n8n.io/code/expressions/">expresión</a>',
				displayOptions: { show: { resource: ['message'], operation: ['send'], target: ['phone'] } },
			},
			{
				displayName: 'Teléfono',
				name: 'sendTo',
				type: 'string',
				required: true,
				default: '',
				placeholder: '5215512345678',
				description: 'Con código de país; 10 dígitos sin + se toman como México',
				displayOptions: { show: { resource: ['message'], operation: ['send'], target: ['phone'] } },
			},
			{
				displayName: 'ID del contacto',
				name: 'sendContactId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['message'], operation: ['send'], target: ['contact'] } },
			},
			{
				displayName: 'ID de la conversación',
				name: 'sendConversationId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['message'], operation: ['send'], target: ['conversation'] } },
			},
			{
				displayName: 'Tipo',
				name: 'type',
				type: 'options',
				options: [
					{ name: 'Audio', value: 'audio' },
					{ name: 'Avanzado (JSON)', value: 'json', description: 'Cualquier tipo de POST /messages: product_list, contacts, plantillas de carrusel…' },
					{ name: 'Botón con URL', value: 'cta_url', description: 'Texto con un botón que abre una URL (WhatsApp)' },
					{ name: 'Botones', value: 'buttons', description: 'Texto con hasta 3 botones de respuesta' },
					{ name: 'Catálogo', value: 'catalog', description: 'Botón «Ver catálogo» (WhatsApp)' },
					{ name: 'Documento', value: 'document' },
					{ name: 'Flow', value: 'flow', description: 'Formulario de WhatsApp Flows' },
					{ name: 'Imagen', value: 'image' },
					{ name: 'Lista', value: 'list', description: 'Texto con un menú de hasta 10 opciones' },
					{ name: 'Pedir ubicación', value: 'location_request', description: 'Pide al cliente su ubicación (WhatsApp)' },
					{ name: 'Plantilla', value: 'template', description: 'Plantilla aprobada (necesaria fuera de la ventana de 24 h)' },
					{ name: 'Producto', value: 'product', description: 'Un producto del catálogo (WhatsApp)' },
					{ name: 'Sticker', value: 'sticker', description: 'WebP de 512×512 (WhatsApp)' },
					{ name: 'Texto', value: 'text' },
					{ name: 'Ubicación', value: 'location', description: 'Un punto en el mapa (WhatsApp)' },
					{ name: 'Video', value: 'video' },
				],
				default: 'text',
				description: 'Texto, botones y archivos solo se pueden enviar dentro de la ventana de 24 h del cliente; fuera de ella usa una plantilla',
				displayOptions: show('message', ['send']),
			},
			{
				displayName: 'Texto',
				name: 'text',
				type: 'string',
				typeOptions: { rows: 4 },
				required: true,
				default: '',
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['text', 'buttons', 'list', 'cta_url', 'location_request', 'flow', 'catalog'] } },
			},
			{
				displayName: 'Campos del mensaje (JSON)',
				name: 'messageJson',
				type: 'json',
				required: true,
				default: '{\n  "type": "contacts",\n  "contacts": [{ "name": "Laura Gómez", "phones": [{ "phone": "+52 55 1234 5678" }] }]\n}',
				description: 'Campos de POST /messages (type y los suyos); el destino lo pone «Enviar a»',
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['json'] } },
			},
			{
				displayName: 'Botón de la lista',
				name: 'listButton',
				type: 'string',
				required: true,
				default: 'Ver opciones',
				description: 'Texto del botón que abre la lista (20 caracteres)',
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['list'] } },
			},
			{
				displayName: 'Opciones de la lista',
				name: 'listRows',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Agregar opción',
				default: {},
				description: 'Hasta 10 opciones',
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['list'] } },
				options: [
					{
						name: 'row',
						displayName: 'Opción',
						values: [
							{ displayName: 'Título', name: 'title', type: 'string', default: '' },
							{ displayName: 'Descripción', name: 'description', type: 'string', default: '' },
							{ displayName: 'ID', name: 'id', type: 'string', default: '', description: 'Opcional; llega en la respuesta del cliente' },
						],
					},
				],
			},
			{
				displayName: 'Texto del botón',
				name: 'ctaLabel',
				type: 'string',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['cta_url'] } },
			},
			{
				displayName: 'URL del botón',
				name: 'ctaUrl',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'https://...',
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['cta_url'] } },
			},
			{
				displayName: 'Latitud',
				name: 'latitude',
				type: 'number',
				typeOptions: { numberPrecision: 6 },
				required: true,
				default: 0,
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['location'] } },
			},
			{
				displayName: 'Longitud',
				name: 'longitude',
				type: 'number',
				typeOptions: { numberPrecision: 6 },
				required: true,
				default: 0,
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['location'] } },
			},
			{
				displayName: 'Opciones de ubicación',
				name: 'locationOptions',
				type: 'collection',
				placeholder: 'Agregar opción',
				default: {},
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['location'] } },
				options: [
					{ displayName: 'Nombre', name: 'name', type: 'string', default: '' },
					{ displayName: 'Dirección', name: 'address', type: 'string', default: '' },
				],
			},
			{
				displayName: 'ID del producto (retailer ID)',
				name: 'productId',
				type: 'string',
				required: true,
				default: '',
				description: '«ID de contenido» del producto en Commerce Manager',
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['product'] } },
			},
			{
				displayName: 'ID del Flow',
				name: 'flowId',
				type: 'string',
				required: true,
				default: '',
				description: 'De WhatsApp → Listar Flows',
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['flow'] } },
			},
			{
				displayName: 'Botón del Flow',
				name: 'flowCta',
				type: 'string',
				required: true,
				default: 'Abrir',
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['flow'] } },
			},
			{
				displayName: 'Opciones del Flow',
				name: 'flowOptions',
				type: 'collection',
				placeholder: 'Agregar opción',
				default: {},
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['flow'] } },
				options: [
					{ displayName: 'Borrador', name: 'draft', type: 'boolean', default: false, description: 'Envía el Flow en borrador (DRAFT) para probarlo' },
					{ displayName: 'Datos iniciales (JSON)', name: 'data', type: 'json', default: '' },
					{ displayName: 'Encabezado', name: 'header', type: 'string', default: '' },
					{ displayName: 'Primera pantalla', name: 'screen', type: 'string', default: '' },
					{ displayName: 'Referencia del Flow', name: 'reference', type: 'string', default: '', description: 'Se manda como flow.token y vuelve en flow.completed para cruzar la respuesta; por omisión Colibly genera uno' },
				],
			},
			{
				displayName: 'Opciones del producto',
				name: 'productOptions',
				type: 'collection',
				placeholder: 'Agregar opción',
				default: {},
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['product', 'catalog'] } },
				options: [
					{ displayName: 'ID del catálogo', name: 'catalogId', type: 'string', default: '', description: 'Solo si la cuenta tiene varios catálogos (o es de coexistencia)' },
					{ displayName: 'Pie', name: 'footer', type: 'string', default: '' },
					{ displayName: 'Texto', name: 'text', type: 'string', default: '' },
					{ displayName: 'ID del producto de la miniatura', name: 'thumbnailProductId', type: 'string', default: '', description: 'Catálogo: producto de la miniatura' },
				],
			},
			{
				displayName: 'Botones',
				name: 'buttons',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Agregar botón',
				default: {},
				description: 'Máximo 3 botones de hasta 20 caracteres',
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['buttons'] } },
				options: [
					{
						name: 'button',
						displayName: 'Botón',
						values: [
							{ displayName: 'Título', name: 'title', type: 'string', default: '' },
							{ displayName: 'ID', name: 'id', type: 'string', default: '', description: 'Opcional; llega en la respuesta del cliente' },
						],
					},
				],
			},
			{
				displayName: 'Plantilla (nombre o ID)',
				name: 'templateId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getTemplates' },
				required: true,
				default: '',
				description: 'Plantillas aprobadas. Elige de la lista o indica un ID con una <a href="https://docs.n8n.io/code/expressions/">expresión</a>.',
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['template'] } },
			},
			{
				displayName: 'Parámetros de la plantilla',
				name: 'templateParams',
				type: 'collection',
				placeholder: 'Agregar parámetro',
				default: {},
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['template'] } },
				options: [
					{ displayName: 'Avanzado (JSON)', name: 'advanced', type: 'json', default: '', description: 'Más campos de template: buttons (payload, couponCode…), code (OTP), offerExpiresAt, cards (carrusel), headerLocation' },
					{ displayName: 'Código (autenticación)', name: 'code', type: 'string', default: '', description: 'Código de verificación de una plantilla AUTHENTICATION' },
					{ displayName: 'Parámetro del botón', name: 'buttonParam', type: 'string', default: '', description: 'Sufijo del botón con URL dinámica' },
					{ displayName: 'Parámetro del encabezado', name: 'headerParam', type: 'string', default: '', description: 'Texto del encabezado, URL https o ID de medio (Medio → Subir)' },
					{ displayName: 'Parámetros del cuerpo', name: 'bodyParams', type: 'string', default: '', description: 'Valores de {{1}}, {{2}}… en orden, separados por |; o un objeto JSON {"nombre": "Ana"} para variables con nombre' },
				],
			},
			{
				displayName: 'URL del archivo o ID del medio',
				name: 'mediaUrl',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'https://... o cmmed_…',
				description: 'URL pública https del archivo, o el ID de Medio → Subir para reusarlo',
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['image', 'document', 'audio', 'video', 'sticker'] } },
			},
			{
				displayName: 'ID del mensaje a citar',
				name: 'replyTo',
				type: 'string',
				default: '',
				description: 'Opcional (WhatsApp): cita ese mensaje de la misma conversación',
				displayOptions: show('message', ['send']),
			},
			{
				displayName: 'Opciones del archivo',
				name: 'mediaOptions',
				type: 'collection',
				placeholder: 'Agregar opción',
				default: {},
				displayOptions: { show: { resource: ['message'], operation: ['send'], type: ['image', 'document', 'audio', 'video'] } },
				options: [
					{ displayName: 'Leyenda', name: 'caption', type: 'string', default: '', description: 'No aplica a audios' },
					{ displayName: 'Nombre del archivo', name: 'filename', type: 'string', default: '' },
					{ displayName: 'Tipo MIME', name: 'mimeType', type: 'string', default: '' },
				],
			},

			// ── Automatización ──
			{
				displayName: 'Operación',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['automation'] } },
				options: [
					{ name: 'Listar', value: 'getAll', action: 'Listar automatizaciones' },
					{ name: 'Ejecutar', value: 'run', action: 'Ejecutar una automatización para un contacto', description: 'Inicia una automatización con disparador manual' },
				],
				default: 'run',
			},
			{
				displayName: 'Automatización (nombre o ID)',
				name: 'automationId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getRunnableAutomations' },
				required: true,
				default: '',
				description: 'Automatizaciones activas con disparador «manual». Elige de la lista o indica un ID con una <a href="https://docs.n8n.io/code/expressions/">expresión</a>.',
				displayOptions: show('automation', ['run']),
			},
			{
				displayName: 'ID del contacto',
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
				placeholder: 'Agregar variable',
				default: {},
				displayOptions: show('automation', ['run']),
				options: [
					{
						name: 'variable',
						displayName: 'Variable',
						values: [
							{ displayName: 'Nombre', name: 'name', type: 'string', default: '' },
							{ displayName: 'Valor', name: 'value', type: 'string', default: '' },
						],
					},
				],
			},
			{
				displayName: 'Solo ejecutables',
				name: 'onlyRunnable',
				type: 'boolean',
				default: true,
				description: 'Lista solo las automatizaciones activas con disparador manual',
				displayOptions: show('automation', ['getAll']),
			},

			// ── WhatsApp (administración del número) ──
			{
				displayName: 'Operación',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['whatsapp'] } },
				options: [
					{ name: 'Actualizar automatización conversacional', value: 'updateAutomation', action: 'Actualizar sugerencias, comandos y mensaje de bienvenida' },
					{ name: 'Actualizar perfil', value: 'updateProfile', action: 'Actualizar el perfil del negocio' },
					{ name: 'Bloquear usuarios', value: 'block', action: 'Bloquear usuarios' },
					{ name: 'Cambiar PIN de dos pasos', value: 'setPin', action: 'Cambiar el PIN de verificación en dos pasos' },
					{ name: 'Crear código QR', value: 'createQr', action: 'Crear un código QR' },
					{ name: 'Crear enlace de conexión', value: 'createLink', action: 'Crear un enlace para conectar un número', description: 'Tu cliente conecta su número con su Facebook, sin cuenta en Colibly' },
					{ name: 'Crear Flow', value: 'createFlow', action: 'Crear un Flow' },
					{ name: 'Desbloquear usuario', value: 'unblock', action: 'Desbloquear un usuario' },
					{ name: 'Eliminar código QR', value: 'deleteQr', action: 'Eliminar un código QR' },
					{ name: 'Listar códigos QR', value: 'getQr', action: 'Listar los códigos QR' },
					{ name: 'Listar Flows', value: 'getFlows', action: 'Listar los Flows' },
					{ name: 'Listar números', value: 'getNumbers', action: 'Listar los números de la WABA' },
					{ name: 'Listar usuarios bloqueados', value: 'getBlocked', action: 'Listar los usuarios bloqueados' },
					{ name: 'Obtener automatización conversacional', value: 'getAutomation', action: 'Obtener sugerencias, comandos y mensaje de bienvenida' },
					{ name: 'Obtener catálogo', value: 'getCatalog', action: 'Obtener la configuración del catálogo' },
					{ name: 'Obtener costos', value: 'getCosts', action: 'Obtener los costos de mensajería' },
					{ name: 'Obtener enlace de conexión', value: 'getLink', action: 'Obtener un enlace de conexión' },
					{ name: 'Obtener estado del número', value: 'getHealth', action: 'Obtener el estado del número', description: 'Calidad, límite de envío y avisos de Meta' },
					{ name: 'Obtener Flow', value: 'getFlow', action: 'Obtener un Flow' },
					{ name: 'Obtener perfil', value: 'getProfile', action: 'Obtener el perfil del negocio' },
					{ name: 'Publicar Flow', value: 'publishFlow', action: 'Publicar un Flow' },
					{ name: 'Registrar número', value: 'register', action: 'Registrar el número' },
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
				description: '6 dígitos. En Registrar número puede ir vacío: se usa el guardado.',
				displayOptions: show('whatsapp', ['setPin', 'register']),
			},
			{
				displayName: 'Opciones del enlace',
				name: 'linkOptions',
				type: 'collection',
				placeholder: 'Agregar opción',
				default: {},
				displayOptions: show('whatsapp', ['createLink']),
				options: [
					{ displayName: 'Nombre de la cuenta', name: 'name', type: 'string', default: '', description: 'Nombre de la cuenta que se creará' },
					{ displayName: 'Vence en (horas)', name: 'expiresInHours', type: 'number', typeOptions: { minValue: 1, maxValue: 720 }, default: 72 },
					{ displayName: 'URL de regreso', name: 'redirectUrl', type: 'string', default: '', description: 'A dónde vuelve tu cliente al terminar (https)' },
					{ displayName: 'Referencia', name: 'reference', type: 'string', default: '', description: 'Tu ID del cliente; vuelve en el evento «Número conectado» (account.connected)' },
				],
			},
			{
				displayName: 'ID del enlace',
				name: 'linkId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: show('whatsapp', ['getLink']),
			},
			{
				displayName: 'Teléfonos',
				name: 'phones',
				type: 'string',
				required: true,
				default: '',
				description: 'Separados por comas, con código de país',
				displayOptions: show('whatsapp', ['block', 'unblock']),
			},
			{
				displayName: 'Mensaje precargado',
				name: 'prefilledMessage',
				type: 'string',
				required: true,
				default: '',
				description: 'Lo que aparece escrito al escanear (140 caracteres)',
				displayOptions: show('whatsapp', ['createQr']),
			},
			{
				displayName: 'Código QR',
				name: 'qrCode',
				type: 'string',
				required: true,
				default: '',
				displayOptions: show('whatsapp', ['deleteQr']),
			},
			{
				displayName: 'ID del Flow',
				name: 'waFlowId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: show('whatsapp', ['getFlow', 'publishFlow']),
			},
			{
				displayName: 'Desde',
				name: 'since',
				type: 'dateTime',
				default: '',
				description: 'Por omisión, hace 30 días',
				displayOptions: show('whatsapp', ['getCosts']),
			},
			{
				displayName: 'Hasta',
				name: 'until',
				type: 'dateTime',
				default: '',
				displayOptions: show('whatsapp', ['getCosts']),
			},
			json('Perfil (JSON)', 'profileJson', show('whatsapp', ['updateProfile']), 'about, address, description, email, websites, vertical, profilePictureUrl'),
			json('Automatización conversacional (JSON)', 'automationJson', show('whatsapp', ['updateAutomation']), 'prompts (hasta 4), commands ([{ name, description }]) y/o welcomeMessage ({ enabled, text })'),
			json('Flow (JSON)', 'flowJson', show('whatsapp', ['createFlow']), 'name, categories, flowJson y opcionalmente publish, endpointUri o useColiblyEndpoint'),

			// ── Plantillas ──
			{
				displayName: 'Operación',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['template'] } },
				options: [
					{ name: 'Crear', value: 'create', action: 'Crear una plantilla', description: 'La manda a revisión de Meta' },
					{ name: 'Editar', value: 'edit', action: 'Editar una plantilla', description: 'Vuelve a revisión' },
					{ name: 'Eliminar', value: 'delete', action: 'Eliminar una plantilla' },
					{ name: 'Listar', value: 'getAll', action: 'Listar plantillas' },
					{ name: 'Obtener', value: 'get', action: 'Obtener una plantilla' },
					{ name: 'Obtener analíticas', value: 'analytics', action: 'Obtener las analíticas de una plantilla' },
				],
				default: 'getAll',
			},
			{
				displayName: 'Plantilla (nombre o ID)',
				name: 'tplId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getAllTemplates' },
				required: true,
				default: '',
				description: 'Elige de la lista o indica un ID con una <a href="https://docs.n8n.io/code/expressions/">expresión</a>',
				displayOptions: show('template', ['delete', 'edit', 'get', 'analytics']),
			},
			json(
				'Plantilla (JSON)',
				'templateJson',
				show('template', ['create']),
				'accountId, name, language, category y components (body, bodyExamples, header, footer, buttons, limitedTimeOffer, carousel, authentication)',
			),
			json('Cambios (JSON)', 'templateEditJson', show('template', ['edit']), 'components (y category si no está aprobada)'),

			// ── Archivos ──
			{
				displayName: 'Operación',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['media'] } },
				options: [
					{ name: 'Eliminar', value: 'delete', action: 'Eliminar un archivo subido' },
					{ name: 'Subir', value: 'upload', action: 'Subir un archivo desde una URL', description: 'Devuelve un ID para reusarlo 30 días' },
				],
				default: 'upload',
			},
			{
				displayName: 'Tipo de archivo',
				name: 'mediaType',
				type: 'options',
				options: [
					{ name: 'Audio', value: 'audio' },
					{ name: 'Documento', value: 'document' },
					{ name: 'Imagen', value: 'image' },
					{ name: 'Sticker', value: 'sticker' },
					{ name: 'Video', value: 'video' },
				],
				default: 'image',
				displayOptions: show('media', ['upload']),
			},
			{
				displayName: 'URL del archivo',
				name: 'uploadUrl',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'https://...',
				displayOptions: show('media', ['upload']),
			},
			{
				displayName: 'ID del medio',
				name: 'mediaId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: show('media', ['delete']),
			},

			// ── Llamadas ──
			{
				displayName: 'Operación',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['call'] } },
				options: [
					{ name: 'Obtener', value: 'get', action: 'Obtener una llamada' },
					{ name: 'Listar', value: 'getAll', action: 'Listar llamadas' },
				],
				default: 'getAll',
			},
			{
				displayName: 'ID de la llamada',
				name: 'callId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: show('call', ['get']),
			},
			...returnAllFields('call', 'getAll'),
			{
				displayName: 'Filtros',
				name: 'callFilters',
				type: 'collection',
				placeholder: 'Agregar filtro',
				default: {},
				displayOptions: show('call', ['getAll']),
				options: [
					{ displayName: 'Cuenta (nombre o ID)', name: 'accountId', type: 'options', typeOptions: { loadOptionsMethod: 'getWhatsappAccounts' }, default: '', description: 'Elige de la lista o indica un ID con una <a href="https://docs.n8n.io/code/expressions/">expresión</a>' },
					{ displayName: 'Desde', name: 'since', type: 'dateTime', default: '' },
					{
						displayName: 'Dirección',
						name: 'direction',
						type: 'options',
						options: [
							{ name: 'Entrante', value: 'inbound' },
							{ name: 'Saliente', value: 'outbound' },
						],
						default: 'inbound',
					},
					{
						displayName: 'Estado',
						name: 'status',
						type: 'options',
						options: [
							{ name: 'Terminada', value: 'ENDED' },
							{ name: 'Fallida', value: 'FAILED' },
							{ name: 'Perdida', value: 'MISSED' },
							{ name: 'Rechazada', value: 'REJECTED' },
						],
						default: 'MISSED',
					},
					{ displayName: 'ID del contacto', name: 'contactId', type: 'string', default: '' },
				],
			},

			// ── Espacio de trabajo (catálogos) ──
			{
				displayName: 'Operación',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['workspace'] } },
				options: [
					{ name: 'Listar cuentas', value: 'accounts', action: 'Listar las cuentas conectadas' },
					{ name: 'Listar equipos', value: 'teams', action: 'Listar los equipos' },
					{ name: 'Listar etiquetas', value: 'tags', action: 'Listar las etiquetas' },
					{ name: 'Listar plantillas', value: 'templates', action: 'Listar las plantillas' },
					{ name: 'Listar usuarios', value: 'users', action: 'Listar los usuarios' },
					{ name: 'Obtener identidad de la key', value: 'me', action: 'Obtener la identidad de la API key', description: 'Dueño, permisos y cuentas de la API key' },
				],
				default: 'accounts',
			},
			{
				displayName: 'Cuenta (nombre o ID)',
				name: 'templatesAccountId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getWhatsappAccounts' },
				default: '',
				description: 'Opcional: solo las de esta cuenta. Elige de la lista o indica un ID con una <a href="https://docs.n8n.io/code/expressions/">expresión</a>.',
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
