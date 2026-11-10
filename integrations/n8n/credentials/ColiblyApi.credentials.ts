import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class ColiblyApi implements ICredentialType {
	name = 'coliblyApi';

	displayName = 'Colibly API';

	icon: Icon = { light: 'file:colibly.svg', dark: 'file:colibly.dark.svg' };

	documentationUrl = 'https://app.colibly.com/docs/api';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			placeholder: 'sk_live_...',
			description:
				'Créala en Colibly → Configuración → API. Activa los permisos de lo que vas a usar (contactos, conversaciones, mensajes, webhooks, automatizaciones).',
		},
		{
			displayName: 'URL de Colibly',
			name: 'baseUrl',
			type: 'string',
			required: true,
			default: 'https://app.colibly.com',
			description: 'Cámbiala solo si usas otra instalación de Colibly',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/$/, "")}}',
			url: '/api/v1/me',
		},
	};
}
