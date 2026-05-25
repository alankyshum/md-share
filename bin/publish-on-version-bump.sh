#!/usr/bin/env bash
set -euo pipefail

# Determine if dry-run is requested
DRY_RUN=false
for arg in "$@"; do
  if [ "$arg" = "--dry-run" ]; then
    DRY_RUN=true
  fi
done

echo "Checking for package version bumps..."

# Ensure we are in the repo root
cd "$(dirname "$0")/.."

# Check if there is a previous commit to compare against
if ! git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
  echo "No previous commit (HEAD~1) found to compare against. Skipping version-bump checks."
  exit 0
fi

# Find all package.json files in packages/
find packages -name package.json -not -path '*/node_modules/*' | while read -r pkg_json; do
  pkg_dir=$(dirname "$pkg_json")
  
  # Get version in HEAD
  current_version=$(git show HEAD:"$pkg_json" | node -e "
    try {
      const data = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
      console.log(data.version || '');
    } catch (e) {
      console.log('');
    }
  ")
  
  # Get version in HEAD~1
  prev_version=$(git show HEAD~1:"$pkg_json" 2>/dev/null | node -e "
    try {
      const data = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
      console.log(data.version || '');
    } catch (e) {
      console.log('');
    }
  " || echo "")
  
  # Get package name
  pkg_name=$(git show HEAD:"$pkg_json" | node -e "
    try {
      const data = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
      console.log(data.name || '');
    } catch (e) {
      console.log('');
    }
  ")

  # Get private status in HEAD
  is_private=$(git show HEAD:"$pkg_json" | node -e "
    try {
      const data = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
      console.log(data.private || false);
    } catch (e) {
      console.log(false);
    }
  ")

  if [ -n "$current_version" ] && [ "$current_version" != "$prev_version" ]; then
    if [ "$is_private" = "true" ]; then
      echo "Skipped $pkg_name (private package)"
      continue
    fi

    if [ -z "$prev_version" ]; then
      echo "Skipped $pkg_name (new package, previous version empty)"
      continue
    fi

    echo "Detected version bump for $pkg_name: $prev_version -> $current_version"
    
    if [ "$DRY_RUN" = true ]; then
      echo "[DRY RUN] Would publish $pkg_name version $current_version to npm"
    else
      echo "Publishing $pkg_name@$current_version to npm..."
      (
        cd "$pkg_dir"
        npm publish --access public
      )
    fi
  fi
done
