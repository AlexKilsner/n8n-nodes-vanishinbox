import { createHmac, timingSafeEqual } from 'crypto';
import type {
	IHookFunctions,
	IWebhookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { vanishInboxApiRequest, encodedAddress } from '../GenericFunctions';

// How much clock skew to tolerate between the worker's timestamp and now.
// Generous because Cloudflare Workers and n8n hosts are rarely more than a
// few seconds apart, but this guards against a stale/replayed signature.
const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;

interface StoredWebhook {
	secret: string;
}

export class VanishInboxTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'VanishInbox Trigger',
		name: 'vanishInboxTrigger',
		icon: 'file:vanishinbox.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["address"]}}',
		description: 'Starts the workflow instantly when an email arrives at a VanishInbox address',
		defaults: { name: 'VanishInbox Trigger' },
		inputs: [],
		outputs: ['main'],
		credentials: [{ name: 'vanishInboxApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Address',
				name: 'address',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'name@fommie.com',
				description:
					'The disposable inbox address to watch. Generate one first with the VanishInbox node (Inbox → Generate) if you don\'t have one yet — only auto-generated addresses (no custom username) are webhook-eligible.',
			},
		],
	};

	webhookMethods = {
		default: {
			// Called by n8n before `create`, when the workflow is (re)activated —
			// lets n8n skip creation if a matching webhook is already registered.
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const address = this.getNodeParameter('address') as string;
				try {
					const existing = await vanishInboxApiRequest.call(
						this,
						'GET',
						`/inbox/${encodedAddress(address)}/webhooks`,
					);
					return !!existing?.id;
				} catch {
					// 404 (no webhook registered) or 403 (address not owned by this key) —
					// either way, nothing exists that this hook is responsible for.
					return false;
				}
			},

			// Called when the workflow is activated and checkExists returned false.
			async create(this: IHookFunctions): Promise<boolean> {
				const address = this.getNodeParameter('address') as string;
				const webhookUrl = this.getNodeWebhookUrl('default') as string;

				const response = await vanishInboxApiRequest.call(
					this,
					'POST',
					`/inbox/${encodedAddress(address)}/webhooks`,
					{ target_url: webhookUrl },
				);

				if (!response?.secret) {
					throw new NodeOperationError(
						this.getNode(),
						'VanishInbox did not return a signing secret when registering the webhook.',
					);
				}

				// The secret is only ever shown once, on this response — persist it in
				// workflow static data so the webhook handler can verify signatures later.
				const staticData = this.getWorkflowStaticData('node') as Record<string, StoredWebhook>;
				staticData[address] = { secret: response.secret as string };

				return true;
			},

			// Called when the workflow is deactivated or the node is deleted.
			async delete(this: IHookFunctions): Promise<boolean> {
				const address = this.getNodeParameter('address') as string;
				try {
					await vanishInboxApiRequest.call(
						this,
						'DELETE',
						`/inbox/${encodedAddress(address)}/webhooks`,
					);
				} catch {
					// Already gone (e.g. expired naturally via TTL) — deactivation should
					// still succeed either way.
				}

				const staticData = this.getWorkflowStaticData('node') as Record<string, StoredWebhook>;
				delete staticData[address];

				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const address = this.getNodeParameter('address') as string;
		const staticData = this.getWorkflowStaticData('node') as Record<string, StoredWebhook>;
		const stored = staticData[address];

		const req = this.getRequestObject();
		const signatureHeader = req.headers['x-webhook-signature'] as string | undefined;

		if (!stored?.secret || !signatureHeader) {
			// No secret on file, or no signature sent — reject rather than trust an
			// unverifiable payload. Returning noWebhookResponse means "ignore this call."
			return { noWebhookResponse: true };
		}

		const match = /^t=(\d+),v1=([0-9a-f]+)$/.exec(signatureHeader);
		if (!match) {
			return { noWebhookResponse: true };
		}
		const [, timestampStr, providedSig] = match;

		const age = Date.now() - Number(timestampStr);
		if (age > MAX_SIGNATURE_AGE_MS || age < -MAX_SIGNATURE_AGE_MS) {
			return { noWebhookResponse: true };
		}

		// Signed message is `${timestamp}.${rawBodyString}` — must match the exact
		// JSON string the worker signed, not a re-serialized version of the parsed body.
		const rawBody = JSON.stringify(this.getBodyData());
		const expectedSig = createHmac('sha256', stored.secret)
			.update(`${timestampStr}.${rawBody}`)
			.digest('hex');

		const expectedBuf = Buffer.from(expectedSig, 'hex');
		const providedBuf = Buffer.from(providedSig, 'hex');
		const validSignature =
			expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);

		if (!validSignature) {
			return { noWebhookResponse: true };
		}

		return {
			workflowData: [this.helpers.returnJsonArray([this.getBodyData()])],
		};
	}
}
