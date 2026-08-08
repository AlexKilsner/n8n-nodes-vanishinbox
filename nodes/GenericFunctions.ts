import type {
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	ILoadOptionsFunctions,
	IWebhookFunctions,
	IDataObject,
} from 'n8n-workflow';

const BASE_URL = 'https://vanishinbox.com/api/v1';

/**
 * Thin wrapper around the VanishInbox REST API. Auth is attached automatically
 * by the vanishInboxApi credential's `authenticate` block (see credentials/),
 * so callers never handle the Bearer token directly.
 */
export async function vanishInboxApiRequest(
	this: IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions | IWebhookFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject = {},
	qs: IDataObject = {},
) {
	const options = {
		method,
		body: Object.keys(body).length ? body : undefined,
		qs: Object.keys(qs).length ? qs : undefined,
		url: `${BASE_URL}${endpoint}`,
		json: true,
	};

	return this.helpers.httpRequestWithAuthentication.call(this, 'vanishInboxApi', options);
}

/** address is used directly in URL paths (e.g. .../inbox/{address}/webhooks) — always encode it. */
export function encodedAddress(address: string): string {
	return encodeURIComponent(address.trim());
}
