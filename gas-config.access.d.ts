/** Script Property holding the comma-separated editor emails. */
declare const _GAS_CONFIG_EDITORS_PROPERTY = "GAS_CONFIG_EDITORS";
/** Script Property holding the comma-separated reader emails. */
declare const _GAS_CONFIG_READERS_PROPERTY = "GAS_CONFIG_READERS";
/** Constructor options for `_GasConfigAccess`; `undefined` means omitted. */
interface _GasConfigAccessOptions {
    /** Normalised editor emails. */
    editors?: readonly string[] | undefined;
    /** Normalised reader emails. */
    readers?: readonly string[] | undefined;
    restrictReads?: boolean | undefined;
}
/**
 * The `editors` and `readers` allowlists and the identity of the signed-in
 * user.
 *
 * This is a guard for UI users, not a security boundary: anyone who can edit
 * the script can read and change Script Properties directly, which also
 * bypasses `readers`. Reads through `get()` and `getAll()` are never gated.
 * Reads of the settings UI are ungated unless restricted; once restricted,
 * only editors and readers may read, and users who cannot be identified are
 * denied. Readers, and everyone when reads are unrestricted, get a read-only
 * view of the settings.
 *
 * The user is identified through `Session.getActiveUser()`, which needs the
 * `https://www.googleapis.com/auth/userinfo.email` scope, and for web apps
 * "Execute as: User accessing the web app". Failures follow gas-webapp's auth
 * middleware: an unidentifiable user and an unlisted user are both 401s, and
 * neither message contains the email.
 *
 * A list whose option is omitted is read from its Script Property
 * (`GAS_CONFIG_EDITORS`, `GAS_CONFIG_READERS`) as comma-separated emails, on
 * first use and once per instance. A property holding an invalid email lists
 * nobody, so access fails closed.
 */
declare class _GasConfigAccess {
    private readonly _options;
    private readonly _warn;
    private _properties;
    private _editors;
    /** `null` once resolved when neither the option nor the property is set. */
    private _readers;
    private _identified;
    private _email;
    /**
     * @param options The validated, normalised constructor options.
     * @param warn Logs a warning; must not throw.
     */
    constructor(options: _GasConfigAccessOptions, warn: (message: string, context: Record<string, unknown>) => void);
    /** The editors: the option, else the property, else nobody. */
    editors(): ReadonlySet<string>;
    /**
     * The readers besides the editors: the option, else the property, else
     * `null` when neither is set.
     */
    readers(): ReadonlySet<string> | null;
    /**
     * Whether reads are limited to editors and readers: when `restrictReads` is
     * true, or a readers list is set by option or property.
     */
    restricted(): boolean;
    /**
     * Returns the signed-in user's email, or null when it cannot be determined
     * (the scope is declined, or the account is anonymous or external). Session
     * is read on the first call only, as one execution has one user. Never
     * throws.
     */
    identify(): string | null;
    /** Whether the signed-in user is listed in `editors`, ignoring case. */
    canEdit(): boolean;
    /**
     * Whether the signed-in user may read the settings: always when reads are
     * not restricted (Session is not read), else when identified and listed as
     * an editor or reader. Never throws.
     */
    canRead(): boolean;
    /**
     * Returns the signed-in user's email, or throws a 401 when the user cannot
     * be identified or is not an editor.
     */
    assertCanEdit(): string;
    /**
     * Throws a 401 when reads are restricted and the user cannot be identified
     * or is neither an editor nor a reader. Returns without reading Session
     * when reads are not restricted.
     */
    assertCanRead(): void;
    /**
     * Resolves a list from a Script Property: `undefined` when unset, else the
     * comma-separated emails trimmed, lowercased and deduplicated. An invalid
     * email, or a failed read, lists nobody and warns with the key only, never
     * the value.
     */
    private _fromProperty;
    /** Returns the user's email, or throws a 401 unless listed in one of `lists`. */
    private _assertListed;
}
