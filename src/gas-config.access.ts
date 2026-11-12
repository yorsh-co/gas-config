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
 */
class _GasConfigAccess {
  private readonly _editors: ReadonlySet<string>;
  private readonly _readers: ReadonlySet<string>;
  private readonly _restricted: boolean;
  private _identified = false;
  private _email: string | null = null;

  /**
   * @param editors Normalised (trimmed, lowercase) emails. An empty list
   * means nobody can edit.
   * @param readers Normalised emails allowed to read besides the editors.
   * @param restricted Whether reads are limited to editors and readers.
   */
  constructor(
    editors: readonly string[],
    readers: readonly string[],
    restricted: boolean,
  ) {
    this._editors = new Set(editors);
    this._readers = new Set(readers);
    this._restricted = restricted;
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
    return email !== null && this._editors.has(email.toLowerCase());
  }

  /**
   * Whether the signed-in user may read the settings: always when reads are
   * not restricted (Session is not read), else when identified and listed as
   * an editor or reader. Never throws.
   */
  canRead(): boolean {
    if (!this._restricted) return true;

    const email = this.identify();
    if (email === null) return false;

    const key = email.toLowerCase();
    return this._editors.has(key) || this._readers.has(key);
  }

  /**
   * Returns the signed-in user's email, or throws a 401 when the user cannot
   * be identified or is not an editor.
   */
  assertCanEdit(): string {
    return this._assertListed(this._editors);
  }

  /**
   * Throws a 401 when reads are restricted and the user cannot be identified
   * or is neither an editor nor a reader. Returns without reading Session
   * when reads are not restricted.
   */
  assertCanRead(): void {
    if (!this._restricted) return;
    this._assertListed(this._editors, this._readers);
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
