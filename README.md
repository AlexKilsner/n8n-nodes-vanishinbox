# n8n-nodes-vanishinbox

n8n community node for [VanishInbox](https://vanishinbox.com) — generate disposable email inboxes and catch inbound mail (including OTPs) directly inside your n8n workflows.

## Nodes

### VanishInbox (action node)
- **Generate** — create a new disposable inbox address
- **Get Emails** — fetch all emails currently stored for an address
- **Webhook: Register / Get / Delete** — manage a webhook subscription manually
- **Account: Get Usage** — check API key info and remaining credits

### VanishInbox Trigger
Registers a webhook automatically when the workflow is activated, and starts the workflow the instant an email arrives at the given address. Deregisters automatically on deactivation.

## Credentials

**VanishInbox API** — your API key (`vib_live_...`), available from [vanishinbox.com/dashboard/keys](https://vanishinbox.com/dashboard/keys). Attached automatically to every request.

## Installation

In n8n: **Settings → Community Nodes → Install**, then search for `n8n-nodes-vanishinbox`.

## Known limitations

- **Trigger node signature verification is unverified against a live deployment.** The `X-Webhook-Signature` check in `VanishInboxTrigger.node.ts` re-serializes n8n's parsed webhook body with `JSON.stringify` to recompute the HMAC. This has **not** been confirmed to byte-match what the VanishInbox worker actually signs in a real n8n instance reachable from the internet — only the action node's `Generate` and `Get Emails` operations have been confirmed working end to end so far.
  - **If the trigger node never fires on a real email despite the webhook registering successfully:** this is the first thing to check. Deliveries will show as a successful `2xx` on VanishInbox's side with nothing appearing in n8n — a silent mismatch, not an error.
  - Fix path: instrument the `webhook()` method to log the raw computed signature against the received one on a real delivery, or switch to an n8n raw-body webhook option if the SDK exposes one, so the exact received bytes are hashed instead of a re-serialized copy.
- Webhook lifecycle hooks (`checkExists` / `create` / `delete` firing on workflow activate/deactivate) have not been exercised against a real activation — only manual `register`/`get`/`delete` via the action node has been tested.

Issues and PRs welcome: [github.com/AlexKilsner/n8n-nodes-vanishinbox](https://github.com/AlexKilsner/n8n-nodes-vanishinbox)

## License

MIT
