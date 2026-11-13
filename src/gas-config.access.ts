/** Script Property holding the comma-separated editor emails. */
const _GAS_CONFIG_EDITORS_PROPERTY = 'GAS_CONFIG_EDITORS';

/** Script Property holding the comma-separated reader emails. */
const _GAS_CONFIG_READERS_PROPERTY = 'GAS_CONFIG_READERS';

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
class _GasConfigAccess {
  private readonly _options: _GasConfigAccessOptions;
  private readonly _warn: (
    message: string,
    context: Record<string, unknown>,
  ) => void;
  private _properties: GoogleAppsScript.Properties.Properties | null = null;
  private _editors: ReadonlySet<string> | undefined;
  /** `null` once resolved when neither the option nor the property is set. */
  private _readers: ReadonlySet<string> | null | undefined;
  private _readFailed = false;
  private _identified = false;
  private _email: string | null = null;

  /**
   * @param options The validated, normalised constructor options.
   * @param warn Logs a warning; must not throw.
   */
  constructor(
    options: _GasConfigAccessOptions,
    warn: (message: string, context: Record<string, unknown>) => void,
  ) {
    this._options = options;
    this._warn = warn;
  }

  /** The editors: the option, else the property, else nobody. */
  editors(): ReadonlySet<string> {
    this._editors ??= new Set(
      this._options.editors ??
        this._fromProperty(_GAS_CONFIG_EDITORS_PROPERTY) ??
        [],
    );
    return this._editors;
  }

  /**
   * The readers besides the editors: the option, else the property, else
   * `null` when neither is set.
   */
  readers(): ReadonlySet<string> | null {
    if (this._readers === undefined) {
      this._readFailed = false;
      const listed =
        this._options.readers ??
        this._fromProperty(_GAS_CONFIG_READERS_PROPERTY);

      if (
        listed !== undefined &&
        !this._readFailed &&
        this._options.readers === undefined &&
        this._options.restrictReads === false
      ) {
        this._warn(
          `"restrictReads": false contradicts Script Property "${_GAS_CONFIG_READERS_PROPERTY}"; reads are restricted.`,
          { property: _GAS_CONFIG_READERS_PROPERTY },
        );
      }
      this._readers = listed === undefined ? null : new Set(listed);
    }
    return this._readers;
  }

  /**
   * Whether reads are limited to editors and readers: when `restrictReads` is
   * true, or a readers list is set by option or property.
   */
  restricted(): boolean {
    return this._options.restrictReads === true || this.readers() !== null;
  }

  /**
   * Returns the signed-in user's email, or null when it cannot be determined
   * (the scope is declined, or the account is anonymous or external). Session
   * is read on the first call only, as one execution has one user. Never
   * throws.
   */
  identify(): string | null {
    if (!this._identified) {
      this._identified = true;

      try {
        this._email = Session.getActiveUser().getEmail().trim() || null;
      } catch {
        // Scope declined or unavailable; handled as an unidentified user.
      }
    }
    return this._email;
  }

  /** Whether the signed-in user is listed in `editors`, ignoring case. */
  canEdit(): boolean {
    const email = this.identify();
    return email !== null && this.editors().has(email.toLowerCase());
  }

  /**
   * Whether the signed-in user may read the settings: always when reads are
   * not restricted (Session is not read), else when identified and listed as
   * an editor or reader. Never throws.
   */
  canRead(): boolean {
    if (!this.restricted()) return true;

    const email = this.identify();
    if (email === null) return false;

    const key = email.toLowerCase();
    return this.editors().has(key) || (this.readers()?.has(key) ?? false);
  }

  /**
   * Returns the signed-in user's email, or throws a 401 when the user cannot
   * be identified or is not an editor.
   */
  assertCanEdit(): string {
    return this._assertListed(this.editors());
  }

  /**
   * Throws a 401 when reads are restricted and the user cannot be identified
   * or is neither an editor nor a reader. Returns without reading Session
   * when reads are not restricted.
   */
  assertCanRead(): void {
    if (!this.restricted()) return;
    this._assertListed(this.editors(), this.readers() ?? new Set());
  }

  /**
   * Resolves a list from a Script Property: `undefined` when unset, else the
   * comma-separated emails trimmed, lowercased and deduplicated. An invalid
   * email, or a failed read, lists nobody and warns with the key only, never
   * the value.
   */
  private _fromProperty(key: string): string[] | undefined {
    let value: string | null;

    try {
      this._properties ??= PropertiesService.getScriptProperties();
      value = this._properties.getProperty(key);
    } catch (err) {
      this._readFailed = true;
      this._warn(
        `Script Property "${key}" could not be read; nobody is listed.`,
        { property: key, error: err instanceof Error ? err.name : typeof err },
      );
      return [];
    }
    if (value === null) return undefined;

    const emails = [
      ...new Set(
        value
          .split(',')
          .map((email) => email.trim().toLowerCase())
          .filter((email) => email !== ''),
      ),
    ];
    if (emails.some((email) => !_GAS_CONFIG_EMAIL_PATTERN.test(email))) {
      this._warn(
        `Script Property "${key}" holds an invalid email; nobody is listed.`,
        { property: key },
      );
      return [];
    }
    return emails;
  }

  /** Returns the user's email, or throws a 401 unless listed in one of `lists`. */
  private _assertListed(...lists: ReadonlySet<string>[]): string {
    const email = this.identify();

    if (email === null) {
      throw _GasConfigErrors.unauthorized(
        '[GasConfig] Unable to identify the signed-in user',
      );
    }
    const key = email.toLowerCase();
    if (!lists.some((list) => list.has(key))) {
      throw _GasConfigErrors.unauthorized('[GasConfig] Not authorized');
    }
    return email;
  }
}
