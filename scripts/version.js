#!/usr/bin/env node

/**
 * Set the version of every workspace package, and re-point the internal
 * @dorval/* dependencies at it.
 *
 * Both publish paths call this - semantic-release through prepareCmd, and the
 * manual workflow through its version step. They used to carry their own copy
 * of the logic, which is how the manual path ended up bumping versions without
 * re-pointing the CLI's dependency on @dorval/core.
 *
 * Setting a version that is already set is not an error: the manual workflow
 * re-publishes an existing version to recover a half-finished release, and
 * `npm version` refuses that without --allow-same-version.
 *
 * Usage: node scripts/version.js <version>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const version = process.argv[2];

if (!version) {
  console.error('❌ Please provide a version number');
  console.log('Usage: node scripts/version.js <version>');
  console.log('Example: node scripts/version.js 1.0.0');
  process.exit(1);
}

// Validate version format
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error('❌ Invalid version format. Use semantic versioning (e.g., 1.0.0, 1.0.0-beta.1)');
  process.exit(1);
}

console.log(`📦 Updating all packages to version ${version}...`);

const packages = [
  '.',  // Root package.json
  'packages/core',
  'packages/dorval',
  'packages/dio',
  'packages/custom'
];

/**
 * Point every internal dependency at the version being released. The range
 * stays a caret, matching what the published packages already carry.
 */
function repointInternalDeps(deps) {
  if (!deps) {
    return [];
  }

  return Object.keys(deps)
    .filter(name => name.startsWith('@dorval/'))
    .filter(name => {
      const next = `^${version}`;
      if (deps[name] === next) {
        return false;
      }
      deps[name] = next;
      return true;
    });
}

let hasErrors = false;

packages.forEach(pkg => {
  const packageJsonPath = path.join(rootDir, pkg, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    console.warn(`⚠️  Skipping ${pkg} (package.json not found)`);
    return;
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const oldVersion = packageJson.version;
    packageJson.version = version;

    const repointed = [
      ...repointInternalDeps(packageJson.dependencies),
      ...repointInternalDeps(packageJson.devDependencies)
    ];

    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

    const suffix = repointed.length ? ` (${repointed.join(', ')} → ^${version})` : '';
    console.log(`✅ ${pkg}: ${oldVersion} → ${version}${suffix}`);
  } catch (error) {
    console.error(`❌ Failed to update ${pkg}: ${error.message}`);
    hasErrors = true;
  }
});

if (hasErrors) {
  console.error('\n❌ Some packages failed to update');
  process.exit(1);
}

console.log('\n✅ All packages updated successfully!');
