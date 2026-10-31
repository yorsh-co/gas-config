import { describe, expect, it } from 'vitest';
import { loadGasConfig } from './harness';

describe('load order', () => {
  it('exposes GasConfig and its presets', () => {
    const { GasConfig } = loadGasConfig();

    expect(GasConfig).toBeDefined();
    expect(GasConfig.presets).toBeDefined();
  });

  it('constructs with a preset schema', () => {
    const { GasConfig } = loadGasConfig();

    expect(
      () =>
        new GasConfig({
          schema: GasConfig.presets,
          gasSheetDbConfig: {},
        }),
    ).not.toThrow();
  });
});
