import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	IWebhookFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

type Ctx = IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions | IWebhookFunctions;

/** Página máxima de la API pública (API_PAGE_MAX). */
export const PAGE_MAX = 100;

async function baseUrl(this: Ctx): Promise<string> {
	const credentials = await this.getCredentials('coliblyApi');
	return String(credentials.baseUrl || 'https://app.colibly.com').replace(/\/$/, '');
}

/**
 * Llamada a /api/v1 con la credencial de Colibly. Los errores de la API
 * (`{ error: { code, message, details, requestId } }`) se muestran con su
 * mensaje en español y el requestId para soporte.
 */
export async function coliblyApiRequest(
	this: Ctx,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	qs?: IDataObject,
	headers?: Record<string, string>,
): Promise<IDataObject> {
	const options: IHttpRequestOptions = {
		method,
		url: `${await baseUrl.call(this)}/api/v1${path}`,
		json: true,
		headers: { Accept: 'application/json', ...(headers ?? {}) },
		// La respuesta de error de Colibly trae el motivo en español: se lee aquí en vez
		// de dejar que n8n lo convierta en un "Bad request" genérico.
		ignoreHttpStatusErrors: true,
		returnFullResponse: true,
	};
	if (body && Object.keys(body).length > 0) options.body = body;
	if (qs) {
		const clean: IDataObject = {};
		for (const [k, v] of Object.entries(qs)) if (v !== undefined && v !== null && v !== '') clean[k] = v;
		if (Object.keys(clean).length) options.qs = clean;
	}
	const res = (await this.helpers.httpRequestWithAuthentication.call(this, 'coliblyApi', options)) as {
		statusCode: number;
		body: IDataObject;
	};
	if (res.statusCode >= 400) {
		const apiError = (res.body?.error ?? {}) as { message?: string; code?: string; requestId?: string };
		throw new NodeApiError(this.getNode(), (res.body ?? {}) as JsonObject, {
			httpCode: String(res.statusCode),
			message: apiError.message ?? `Colibly respondió ${res.statusCode}`,
			description: `Código: ${apiError.code ?? 'desconocido'}${apiError.requestId ? ` · requestId: ${apiError.requestId}` : ''}`,
		});
	}
	return res.body ?? {};
}

/** Recorre una lista paginada por cursor (`{ data, nextCursor }`). `limit` corta antes. */
export async function coliblyApiRequestAllItems(
	this: Ctx,
	path: string,
	qs: IDataObject = {},
	limit?: number,
): Promise<IDataObject[]> {
	const out: IDataObject[] = [];
	let cursor: string | null | undefined;
	do {
		const pageSize = limit ? Math.min(PAGE_MAX, limit - out.length) : PAGE_MAX;
		const res = await coliblyApiRequest.call(this, 'GET', path, undefined, { ...qs, limit: pageSize, cursor });
		const rows = (res?.data ?? []) as IDataObject[];
		out.push(...rows);
		cursor = res?.nextCursor as string | null | undefined;
	} while (cursor && (!limit || out.length < limit));
	return limit ? out.slice(0, limit) : out;
}

/** Listas sin paginar (`{ data: [...] }`): cuentas, etiquetas, usuarios, equipos, plantillas, automatizaciones. */
export async function coliblyList(this: Ctx, path: string, qs?: IDataObject): Promise<IDataObject[]> {
	const res = await coliblyApiRequest.call(this, 'GET', path, undefined, qs);
	return (res?.data ?? []) as IDataObject[];
}

/** Clave de idempotencia por ítem: reintentar el flujo no manda el mensaje dos veces. */
export function idempotencyKey(executionId: string, nodeName: string, itemIndex: number): string {
	return `n8n-${executionId}-${nodeName}-${itemIndex}`.replace(/[^\x21-\x7E]/g, '').slice(0, 255);
}

// ── Opciones de los desplegables ──

const CHANNEL_LABEL: Record<string, string> = {
	WHATSAPP: 'WhatsApp',
	TELEGRAM: 'Telegram',
	MESSENGER: 'Messenger',
	INSTAGRAM: 'Instagram',
	WEBCHAT: 'Chat web',
};

export async function getAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const rows = await coliblyList.call(this, '/accounts');
	return rows.map((a) => ({
		name: `${a.name as string} · ${CHANNEL_LABEL[a.channel as string] ?? (a.channel as string)}${a.phoneNumber ? ` (${a.phoneNumber as string})` : ''}`,
		value: a.id as string,
	}));
}

export async function getWhatsappAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const rows = await coliblyList.call(this, '/accounts');
	return rows
		.filter((a) => a.channel === 'WHATSAPP')
		.map((a) => ({ name: `${a.name as string}${a.phoneNumber ? ` (${a.phoneNumber as string})` : ''}`, value: a.id as string }));
}

export async function getTags(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const rows = await coliblyList.call(this, '/tags');
	return rows.map((t) => ({ name: t.name as string, value: t.id as string }));
}

export async function getUsers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const rows = await coliblyList.call(this, '/users');
	return rows.map((u) => ({ name: `${(u.name as string) || (u.email as string)}${u.name ? ` (${u.email as string})` : ''}`, value: u.id as string }));
}

export async function getTeams(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const rows = await coliblyList.call(this, '/teams');
	return rows.map((t) => ({ name: t.name as string, value: t.id as string }));
}

export async function getTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const rows = await coliblyList.call(this, '/templates', { status: 'APPROVED' });
	return rows.map((t) => {
		const params = (t.params ?? {}) as IDataObject;
		const count = Number(params.bodyParamCount ?? 0);
		return {
			name: `${t.name as string} (${t.language as string})`,
			value: t.id as string,
			description: count ? `Pide ${count} ${count === 1 ? 'parámetro' : 'parámetros'} en el cuerpo` : 'Sin parámetros',
		};
	});
}

export async function getRunnableAutomations(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const rows = await coliblyList.call(this, '/automations', { runnable: 'true' });
	return rows.map((a) => ({ name: a.name as string, value: a.id as string }));
}
