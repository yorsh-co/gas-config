/**
 * Reads the page's bootstrap: the JSON the server embeds in
 * `#gas-config-bootstrap`, with query parameters as a development fallback.
 */
const GasConfigBootstrapReader: GasConfigBootstrapReaderApi = (() => {
  const SURFACES: readonly GasConfigSurface[] = ['dialog', 'sidebar', 'page'];
  const THEMES: readonly GasConfigTheme[] = ['workspace', 'yorsh'];

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

  const text = (value: unknown): string | undefined =>
    typeof value === 'string' && value !== '' ? value : undefined;

  const oneOf = <T extends string>(
    allowed: readonly T[],
    value: unknown,
  ): T | undefined => allowed.find((candidate) => candidate === value);

  const parse = (json: string | null | undefined): Record<string, unknown> => {
    if (!json) return {};
    try {
      const parsed: unknown = JSON.parse(json);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };

  const read = (
    json: string | null | undefined,
    search: string,
  ): GasConfigBootstrapResult => {
    const data = parse(json);
    const params = new URLSearchParams(search);
    const brand: GasConfigBootstrapResult['brand'] = {};

    if (isRecord(data['brand'])) {
      const primaryColor = text(data['brand']['primaryColor']);
      const logoUrl = text(data['brand']['logoUrl']);
      if (primaryColor) brand.primaryColor = primaryColor;
      if (logoUrl) brand.logoUrl = logoUrl;
    }

    return {
      surface:
        oneOf(SURFACES, data['surface']) ??
        oneOf(SURFACES, params.get('surface')) ??
        'dialog',
      theme:
        oneOf(THEMES, data['theme']) ??
        oneOf(THEMES, params.get('theme')) ??
        'workspace',
      brand,
      state: isRecord(data['state'])
        ? (data['state'] as unknown as GasConfigSettingsState)
        : null,
    };
  };

  return Object.freeze({ read });
})();
