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
declare class _GasConfigAccess {
  private readonly _editors;
  private readonly _readers;
  private readonly _restricted;
  private _identified;
  private _email;
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
  );
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
  /** Returns the user's email, or throws a 401 unless listed in one of `lists`. */
  private _assertListed;
}
