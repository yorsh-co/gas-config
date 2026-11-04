# Secrets

Design for secret fields, deferred from 2.0 to 2.1. Not implemented.

## Could API keys live in gas-config?

Yes, with conditions. Script Properties is where secrets are stored today, so gas-config storing them there is no weaker. The UI adds two benefits: managers can rotate a key without a developer, and every change is logged.

Requirements, if accepted:

- **A `secret` field type that is write-only.** `getSettings()` never returns its value. The UI shows `Set · ends in 1234 · updated <date> by <email>`, with Replace and Clear actions. The value is only read on the server, through a separate `getSecret(key)`, so nobody reaches it by accident through `get()`.
- **A separate, tighter `secretEditors` allowlist.** It is empty by default: until it is set, secret fields are shown as locked.
- **Redaction.** Change logs, error messages and validation messages never include a secret value; logs record only that it was changed, and by whom. Validation may check the format, for example a key prefix, without echoing the value. This matches gas-webapp's logging middleware, which masks `token`, `password`, `secret`, `key` and `auth` query values.
- **A separate namespace** (`gasConfig:secret:<key>`), so secrets never mix with plain values in `getAll()`.
- **Optional, later:** a server-side "Test" action that checks the key against its API.

## Limits to be explicit about

- The access boundary is edit access to the script, not the allowlist. Anyone who can open the script editor (for bound scripts, every editor of the container) can read Script Properties or run code that does. The allowlist only governs the UI.
- Script Properties are not encrypted with a key you control. Encrypting with a key stored in the same project adds nothing. For high-value secrets, the real boundary is Google Cloud Secret Manager, reached with `UrlFetchApp` (needs the `cloud-platform` scope and a GCP project). That gives you access control, rotation and audit logging.

## OAuth tokens are a different problem

Access and refresh tokens are written by code at runtime, change on their own, and may be per user. They are not configuration. Use a token store designed for them, such as Google's [`apps-script-oauth2`](https://github.com/googleworkspace/apps-script-oauth2) library, which handles the authorization flow, refresh and storage in user or script properties. gas-config could hold that service's client ID and client secret as `secret` fields, which is where the two meet.
