import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, createTypeScriptLoader } from '../config';

const TS_CONFIG = `
interface Cfg { input: string; output: { target: string; mode: string } }
const config: Record<string, Cfg> = {
  petstore: { input: './petstore.json', output: { target: './lib/api', mode: 'split' } }
};
export default config;
`;

const EXPECTED = { input: './petstore.json', output: { target: './lib/api', mode: 'split' } };

describe('Config', () => {
  it('should export loadConfig function', () => {
    expect(loadConfig).toBeDefined();
    expect(typeof loadConfig).toBe('function');
  });

  it('should throw error for non-existent config file', async () => {
    await expect(loadConfig('./non-existent-config.js')).rejects.toThrow();
  });
});

describe('a TypeScript config file', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dorval-config-'));
    await writeFile(join(dir, 'dorval.config.ts'), TS_CONFIG);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it('should load from an explicit path', async () => {
    expect(await loadConfig(join(dir, 'dorval.config.ts'))).toEqual(EXPECTED);
  });

  it('should be found by search under its documented name', async () => {
    // searchPlaces listed orval.config.* only, so `dorval generate` with no
    // --config never found the file the README tells you to write
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
    expect(await loadConfig()).toEqual(EXPECTED);
  });

  it('should handle a typescript package that cannot transpile', async () => {
    // What TypeScript 7 does: the compiler moved to a native binary and the
    // main entry exports only `version`, so cosmiconfig's loader dies on
    // `typescript.findConfigFile is not a function`
    const primary = vi.fn(() => {
      throw new TypeError('typescript.findConfigFile is not a function');
    });
    const loader = createTypeScriptLoader(primary);
    const load = () => loader(join(dir, 'dorval.config.ts'), TS_CONFIG);

    const canStripTypes = typeof (await import('node:module') as any).stripTypeScriptTypes === 'function';

    if (canStripTypes) {
      const loaded = await load();
      expect((loaded as any).petstore).toEqual(EXPECTED);
      // and it leaves nothing behind next to the config
      expect(await readdir(dir)).toEqual(['dorval.config.ts']);
    } else {
      // Node below 22.13 cannot strip types either - the error has to say so
      await expect(load()).rejects.toThrow(/Use Node 22\.13 or newer/);
    }

    expect(primary).toHaveBeenCalled();
  });

});
