'use strict';
/**
 * The `editors` allowlist and the identity of the signed-in user.
 *
 * This is a guard for UI users, not a security boundary: anyone who can edit
 * the script can read and change Script Properties directly. Reads through
 * `get()` and `getAll()` are never gated, and non-editors (including users
 * who cannot be identified) get a read-only view of the settings.
 *
 * The user is identified through `Session.getActiveUser()`, which needs the
 * `https://www.googleapis.com/auth/userinfo.email` scope, and for web apps
 * "Execute as: User accessing the web app". Failures follow gas-webapp's auth
 * middleware: an unidentifiable user and an unlisted user are both 401s, and
 * neither message contains the email.
 */
class _GasConfigAccess {
  /**
   * @param editors Normalised (trimmed, lowercase) emails. An empty list
   * means nobody can edit.
   */
  constructor(editors) {
    this._identified = false;
    this._email = null;
    this._editors = new Set(editors);
  }
  /**
   * Returns the signed-in user's email, or null when it cannot be determined
   * (the scope is declined, or the account is anonymous or external). Session
   * is read on the first call only, as one execution has one user. Never
   * throws.
   */
  identify() {
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
  canEdit() {
    const email = this.identify();
    return email !== null && this._editors.has(email.toLowerCase());
  }
  /**
   * Returns the signed-in user's email, or throws a 401 when the user cannot
   * be identified or is not an editor.
   */
  assertCanEdit() {
    const email = this.identify();
    if (email === null) {
      throw _GasConfigErrors.unauthorized(
        '[GasConfig] Unable to identify the signed-in user',
      );
    }
    if (!this._editors.has(email.toLowerCase())) {
      throw _GasConfigErrors.unauthorized('[GasConfig] Not authorized');
    }
    return email;
  }
}
