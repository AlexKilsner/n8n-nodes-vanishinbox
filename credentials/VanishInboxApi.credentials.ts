import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class VanishInboxApi implements ICredentialType {
	name = 'vanishInboxApi';
	displayName = 'VanishInbox API';
	documentationUrl = 'https://vanishinbox.com/docs/api';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Your VanishInbox developer API key (starts with vib_live_). Get one from vanishinbox.com/dashboard/keys.',
		},
	];

	// Applied to every request made with this credential — attaches the Bearer token automatically.
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// n8n calls this when the user clicks "Test" on the credential — confirms the key actually works.
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://vanishinbox.com/api/v1',
			url: '/me',
			method: 'GET',
		},
	};
}
