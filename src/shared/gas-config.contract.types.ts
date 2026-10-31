/**
 * Wire contract between the settings UI and the server, and the shapes the
 * shared validation operates on.
 *
 * Compiled for both the backend and the browser, so it depends on nothing
 * outside `src/shared/`. Values cross `google.script.run` as JSON-safe types:
 * dates are `'YYYY-MM-DD'` strings and empty values are `null`.
 */

/** Every field type a schema can declare. */
type GasConfigFieldType =
  'string' | 'text' | 'number' | 'boolean' | 'select' | 'url' | 'date';

/** A stored or transferred value. `null` is empty; booleans are never empty. */
type GasConfigValue = string | number | boolean | null;

/** One choice of a `select` field. */
interface GasConfigOption {
  value: string;
  label: string;
}

/** Declarative rules checked by both the browser and the server. */
interface GasConfigClientRules {
  min?: number;
  max?: number;
  integer?: boolean;
  maxLength?: number;
  /** Regular expression source, without delimiters or flags. */
  pattern?: string;
  patternMessage?: string;
}

/** A schema field as the UI sees it: no server-only `validate`. */
interface GasConfigClientField {
  key: string;
  type: GasConfigFieldType;
  label: string;
  description?: string;
  group?: string;
  required: boolean;
  default: GasConfigValue;
  placeholder?: string;
  options?: GasConfigOption[];
  rules?: GasConfigClientRules;
}

/** A settings group, rendered as a section by the UI. */
interface GasConfigGroup {
  id: string;
  label: string;
  description?: string;
}

/** Everything the UI needs to render the settings and edit them. */
interface GasConfigSettingsState {
  title: string;
  description?: string;
  canEdit: boolean;
  /** Opaque stamp of the stored values, sent back with each save. */
  version: string;
  brand?: { logoUrl?: string };
  groups: GasConfigGroup[];
  fields: GasConfigClientField[];
  values: Record<string, GasConfigValue>;
}

/** Payload of `saveSettings`: only the changed keys. */
interface GasConfigSaveRequest {
  changes: Record<string, GasConfigValue>;
  /** The `version` the UI last received. */
  version: string;
  /** Client-generated and unique per save attempt; a retry reuses it. */
  saveId: string;
}

/** The save was applied, or `saveId` repeats the last successful save. */
interface GasConfigSaveSuccess {
  ok: true;
  values: Record<string, GasConfigValue>;
  version: string;
}

/** One or more changes failed validation; nothing was written. */
interface GasConfigSaveInvalid {
  ok: false;
  reason: 'invalid';
  errors: Record<string, string>;
}

/** The stored version moved on since the UI loaded; nothing was written. */
interface GasConfigSaveConflict {
  ok: false;
  reason: 'conflict';
  /** The current stored version. */
  version: string;
}

/** Outcome of `saveSettings`. Failures such as 401 use the error envelope. */
type GasConfigSaveResponse =
  GasConfigSaveSuccess | GasConfigSaveInvalid | GasConfigSaveConflict;

/** Methods routed by `GasConfigRpc`, with their payload and result. */
interface GasConfigRpcMethods {
  getSettings: {
    payload: undefined;
    result: GasConfigSettingsState;
  };
  saveSettings: {
    payload: GasConfigSaveRequest;
    result: GasConfigSaveResponse;
  };
}

/** Name of a method routed by `GasConfigRpc`. */
type GasConfigRpcMethod = keyof GasConfigRpcMethods;

/** A request to `GasConfigRpc`, discriminated on `method`. */
type GasConfigRpcRequest = {
  [M in GasConfigRpcMethod]: {
    method: M;
    payload: GasConfigRpcMethods[M]['payload'];
  };
}[GasConfigRpcMethod];
