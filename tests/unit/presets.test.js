import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPresets, savePreset, countScreens } from '../../server/presets.js';

let file;
beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'ship-presets-'));
  file = join(dir, 'data', 'presets.json'); // nested dir created lazily by savePreset
});

describe('presets store', () => {
  it('returns an empty store when the file does not exist yet', () => {
    expect(loadPresets(file)).toEqual({ presets: {} });
  });

  it('saves a named layout and reloads it', () => {
    savePreset(file, 'Bridge Wall', ['comms-array', null, 'reactor']);
    const store = loadPresets(file);
    expect(store.presets['Bridge Wall'].slots).toEqual(['comms-array', null, 'reactor']);
    expect(typeof store.presets['Bridge Wall'].saved).toBe('string');
  });

  it('keeps multiple presets and overwrites by name', () => {
    savePreset(file, 'A', ['x']);
    savePreset(file, 'B', ['y']);
    savePreset(file, 'A', ['z']); // overwrite
    const { presets } = loadPresets(file);
    expect(Object.keys(presets).sort()).toEqual(['A', 'B']);
    expect(presets.A.slots).toEqual(['z']);
  });

  it('trims whitespace from the preset name', () => {
    savePreset(file, '  Tactical  ', []);
    expect(loadPresets(file).presets.Tactical).toBeTruthy();
  });

  it('rejects a blank name or non-array slots', () => {
    expect(() => savePreset(file, '   ', [])).toThrow(/name/);
    expect(() => savePreset(file, 'ok', 'nope')).toThrow(/slots/);
  });

  it('countScreens returns 0 for a missing directory', () => {
    expect(countScreens('/definitely/not/here')).toBe(0);
  });
});
