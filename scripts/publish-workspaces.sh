#!/bin/bash

# Publish every workspace package, skipping versions already on the registry.
#
# `npm publish --workspaces` stops at the first package it cannot publish, so one
# package the token has no rights to takes the rest down with it and leaves the
# release half done - a tag and a GitHub release for a version npm never got.
# Here each package is published on its own, failures are collected, and the
# script exits non-zero at the end so a real problem still fails the build.
#
# Skipping versions already on the registry makes a re-run pick up whatever was
# missed, rather than failing on the packages that did go out.
#
# Usage: scripts/publish-workspaces.sh [npm-tag]
#   DRY_RUN=1  pass --dry-run to npm publish

set -uo pipefail

TAG=${1:-latest}
DRY_RUN=${DRY_RUN:-}

published=()
skipped=()
failed=()

# core goes first, the CLI package depends on it. Listing it twice and dropping
# the repeat keeps the order explicit rather than leaning on how the glob sorts.
for pkg in $(ls -d packages/core packages/* 2>/dev/null | awk '!seen[$0]++'); do
  [ -f "$pkg/package.json" ] || continue

  name=$(node -p "require('./$pkg/package.json').name")
  version=$(node -p "require('./$pkg/package.json').version")
  private=$(node -p "require('./$pkg/package.json').private === true")

  if [ "$private" = "true" ]; then
    echo "-- $name is private, skipping"
    continue
  fi

  if npm view "$name@$version" version >/dev/null 2>&1; then
    echo "-- $name@$version is already on the registry, skipping"
    skipped+=("$name@$version")
    continue
  fi

  echo "-- publishing $name@$version (tag: $TAG)"
  if (cd "$pkg" && npm publish --access public --tag "$TAG" ${DRY_RUN:+--dry-run}); then
    published+=("$name@$version")
  else
    echo "!! failed to publish $name@$version"
    failed+=("$name@$version")
  fi
done

echo
echo "published: ${published[*]:-none}"
echo "skipped:   ${skipped[*]:-none}"
echo "failed:    ${failed[*]:-none}"

if [ ${#failed[@]} -gt 0 ]; then
  echo
  echo "A 403 on a single package usually means the npm token's granted packages"
  echo "do not cover it - a token scoped to @dorval does not carry the unscoped"
  echo "dorval package."
  exit 1
fi
