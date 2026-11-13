# 0002. Read allowlists from Script Properties

## Context

`editors` and `readers` were constructor options only, so consumers had to
hard-code emails in source. Source is committed and shared, while the list of
people who may edit or read a deployment is deployment configuration.

## Decision

When the matching option is omitted, gas-config reads the Script Properties
`GAS_CONFIG_EDITORS` and `GAS_CONFIG_READERS`.

- **Format.** Comma-separated emails, trimmed, lowercased and deduplicated,
  with empty entries skipped.
- **Precedence.** A constructor option replaces its property entirely. The
  property is read only when the option is omitted. Lists are never merged, so
  each list has one source of truth.
- **Fail closed.** An invalid email in a property makes that list empty, and
  `logger.warn` names the key, never the value.
- **Reads.** `GAS_CONFIG_READERS` set, even to an empty string, restricts
  reads like `readers: []`. `restrictReads: true` restricts without reading
  readers. `restrictReads: false` with the property keeps reads restricted and
  warns. `restrictReads: false` with the `readers` option still throws.
- **Lazy resolution.** The constructor touches no Apps Script service.
  `editors`, `readers` and `restrictReads` are getters that return copies, and
  each property is read at most once per instance, only when an access
  decision or getter needs it.
- **Keys.** They sit outside the `gasConfig:` prefix, so a settings save can
  never write them.

## Consequences

- Source and docs no longer need literal emails.
- Anyone who can edit the script can edit the properties. This is the same
  trust boundary as before, since they could already edit the source.
- `editors`, `readers` and `restrictReads` are no longer plain fields.
  Assigning to them was never documented, but now fails.
- Rejected: merging option and property (two sources, unclear which wins and
  harder to audit); JSON values (easy to get wrong in the properties editor);
  `gasConfig:__` keys (a settings save path could then reach access config).
