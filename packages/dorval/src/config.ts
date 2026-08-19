/**
 * Configuration loader
 */

import { cosmiconfig, defaultLoaders, type Loader } from 'cosmiconfig';
import { randomBytes } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DartGeneratorOptions } from '@dorval/core';

/**
 * Strip types with Node's own transform, for when the `typescript` package
 * cannot do it. Returns undefined on a runtime without the API.
 */
async function stripTypesWithNode(content: string): Promise<string | undefined> {
  const nodeModule = await import('node:module');
  const strip = (nodeModule as any).stripTypeScriptTypes;

  return typeof strip === 'function' ? strip(content, { mode: 'transform' }) : undefined;
}

/**
 * Load a TypeScript config file.
 *
 * cosmiconfig's own loader drives the `typescript` package, and TypeScript 7
 * moved the compiler to a native binary - its main entry exports `version` and
 * nothing else, so that loader dies on `typescript.findConfigFile is not a
 * function`. Try it first anyway, so nothing changes where it already works,
 * and fall back to Node's built-in type stripping when it cannot run.
 */
export function createTypeScriptLoader(primary: Loader = defaultLoaders['.ts']): Loader {
  return async (filepath, content) => {
    try {
      return await primary(filepath, content);
    } catch (error) {
      const stripped = await stripTypesWithNode(content);
      if (stripped === undefined) {
        throw error;
      }

      // Written next to the config so its relative imports still resolve
      const compiled = join(dirname(filepath), `.dorval-config-${randomBytes(6).toString('hex')}.mjs`);
      try {
        await writeFile(compiled, stripped);
        const loaded = await import(pathToFileURL(compiled).href);
        return loaded.default ?? loaded;
      } finally {
        await rm(compiled, { force: true });
      }
    }
  };
}

// Create explorer lazily to avoid initialization issues
function getExplorer() {
  return cosmiconfig('dorval', {
    searchPlaces: [
      // The README documents these, and they were missing - only a config
      // passed with --config was ever found
      'dorval.config.ts',
      'dorval.config.mjs',
      'dorval.config.js',
      'dorval.config.cjs',
      '.dorvalrc',
      '.dorvalrc.json',
      '.dorvalrc.yaml',
      '.dorvalrc.yml',
      // Kept for configs written against the orval-style names
      'orval.config.ts',
      'orval.config.js',
      'orval.config.cjs',
      '.orvalrc',
      '.orvalrc.json',
      '.orvalrc.yaml',
      '.orvalrc.yml',
      'package.json'
    ],
    loaders: {
      '.ts': createTypeScriptLoader()
    }
  });
}

export async function loadConfig(configPath?: string): Promise<DartGeneratorOptions> {
  const explorer = getExplorer();
  const result = configPath
    ? await explorer.load(configPath)
    : await explorer.search();

  if (!result) {
    throw new Error('No configuration file found');
  }

  // Handle default export or direct config
  const config = result.config.default || result.config;

  // If config has multiple specs, use the first one
  if (typeof config === 'object' && !config.input) {
    const firstKey = Object.keys(config)[0];
    return config[firstKey];
  }

  return config;
}
