import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
	JsonObject,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeApiError } from 'n8n-workflow';

import { vanishInboxApiRequest, encodedAddress } from '../GenericFunctions';

export class VanishInbox implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'VanishInbox',
		name: 'vanishInbox',
		icon: { light: 'file:vanishinbox.svg', dark: 'file:vanishinbox.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Generate disposable email inboxes and read inbound mail',
		defaults: { name: 'VanishInbox' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'vanishInboxApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Inbox', value: 'inbox' },
					{ name: 'Webhook', value: 'webhook' },
					{ name: 'Account', value: 'account' },
				],
				default: 'inbox',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['inbox'] } },
				options: [
					{ name: 'Generate', value: 'generate', description: 'Create a new disposable inbox address', action: 'Generate a new disposable inbox' },
					{ name: 'Get Emails', value: 'getEmails', description: 'Fetch all emails currently stored for an address', action: 'Get emails for an inbox' },
				],
				default: 'generate',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['webhook'] } },
				options: [
					{ name: 'Register', value: 'register', description: 'Register a webhook on an address (usually handled automatically by the Trigger node instead)', action: 'Register a webhook' },
					{ name: 'Get', value: 'get', description: 'Fetch webhook metadata for an address', action: 'Get webhook info' },
					{ name: 'Delete', value: 'delete', description: 'Remove the webhook registered on an address', action: 'Delete a webhook' },
				],
				default: 'get',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['account'] } },
				options: [
					{ name: 'Get Usage', value: 'getUsage', description: 'Get API key info and remaining credits', action: 'Get account usage' },
				],
				default: 'getUsage',
			},
			{
				displayName: 'Address',
				name: 'address',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'name@fommie.com',
				description: 'The disposable inbox address',
				displayOptions: {
					show: {
						resource: ['inbox', 'webhook'],
						operation: ['getEmails', 'register', 'get', 'delete'],
					},
				},
			},
			{
				displayName: 'Target URL',
				name: 'targetUrl',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'https://example.com/webhook-receiver',
				description: 'URL that VanishInbox will POST to when mail arrives',
				displayOptions: { show: { resource: ['webhook'], operation: ['register'] } },
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				let responseData: IDataObject | undefined;

				if (resource === 'inbox') {
					if (operation === 'generate') {
						responseData = await vanishInboxApiRequest.call(this, 'POST', '/inbox/generate');
					} else if (operation === 'getEmails') {
						const address = this.getNodeParameter('address', i) as string;
						responseData = await vanishInboxApiRequest.call(this, 'GET', `/inbox/${encodedAddress(address)}`);
					}
				} else if (resource === 'webhook') {
					const address = this.getNodeParameter('address', i) as string;
					const path = `/inbox/${encodedAddress(address)}/webhooks`;

					if (operation === 'register') {
						const targetUrl = this.getNodeParameter('targetUrl', i) as string;
						responseData = await vanishInboxApiRequest.call(this, 'POST', path, { target_url: targetUrl });
					} else if (operation === 'get') {
						responseData = await vanishInboxApiRequest.call(this, 'GET', path);
					} else if (operation === 'delete') {
						responseData = await vanishInboxApiRequest.call(this, 'DELETE', path);
					}
				} else if (resource === 'account') {
					if (operation === 'getUsage') {
						responseData = await vanishInboxApiRequest.call(this, 'GET', '/me');
					}
				}

				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(responseData ?? {}),
					{ itemData: { item: i } },
				);
				returnData.push(...executionData);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw new NodeApiError(this.getNode(), error as JsonObject);
			}
		}

		return [returnData];
	}
}
