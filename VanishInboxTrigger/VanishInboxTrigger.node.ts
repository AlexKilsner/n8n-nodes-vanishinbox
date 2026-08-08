import { createHmac, timingSafeEqual } from 'crypto';
import type {
	IHookFunctions,
	IWebhookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { vanishInboxApiRequest, encodedAddress } from '../GenericFunctions';

const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;

interface StoredWebhook {
	secret: string;
}

export class VanishInboxTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'VanishInbox Trigger',
		name: 'vanishInboxTrigger',
		icon: { light: 'file:vanishinbox.svg', dark: 'file:vanishinbox.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["address"]}}',
		description: 'Starts the workflow instantly when an email arrives at a VanishInbox address',
		defaults: { name: 'VanishInbox Trigger' },
		usableAsTool: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'vanishInboxApi', required: true }],
		webhooks: [
			{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' },
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
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const address = this.getNodeParameter('address') as string;
				try {
					const existing = await vanishInboxApiRequest.call(this, 'GET', `/inbox/${encodedAddress(address)}/webhooks`);
					return !!existing?.id;
				} catch (error) {
					const status = (error as { httpCode?: string; statusCode?: number })?.httpCode ??
						(error as { statusCode?: number })?.statusCode;
					if (status !== 404 && status !== '404' && status !== 403 && status !== '403') {
						this.logger?.warn(
							`VanishInbox Trigger: unexpected error checking existing webhook for ${address}: ${(error as Error).message}`,
						);
					}
					return false;
				}
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const address = this.getNodeParameter('address') as string;
				const webhookUrl = this.getNodeWebhookUrl('default') as string;

				const response = await vanishInboxApiRequest.call(this, 'POST', `/inbox/${encodedAddress(address)}/webhooks`, { target_url: webhookUrl });

				if (!response?.secret) {
					throw new NodeOperationError(this.getNode(), 'VanishInbox did not return a signing secret when registering the webhook.');
				}

				const staticData = this.getWorkflowStaticData('node') as Record<string, StoredWebhook>;
				staticData[address] = { secret: response.secret as string };

				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const address = this.getNodeParameter('address') as string;
				try {
					await vanishInboxApiRequest.call(this, 'DELETE', `/inbox/${encodedAddress(address)}/webhooks`);
				} catch (error) {
					this.logger?.warn(
						`VanishInbox Trigger: could not deregister webhook for ${address} on deactivate: ${(error as Error).message}`,
					);
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

		const rawBody = JSON.stringify(this.getBodyData());
		const expectedSig = createHmac('sha256', stored.secret).update(`${timestampStr}.${rawBody}`).digest('hex');

		const expectedBuf = Buffer.from(expectedSig, 'hex');
		const providedBuf = Buffer.from(providedSig, 'hex');
		const validSignature = expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);

		if (!validSignature) {
			return { noWebhookResponse: true };
		}

		return { workflowData: [this.helpers.returnJsonArray([this.getBodyData()])] };
	}
}
