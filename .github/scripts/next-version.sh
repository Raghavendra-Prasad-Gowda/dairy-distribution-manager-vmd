#!/usr/bin/env bash
# Prints the next release version (no leading "v") from the latest vX.Y.Z tag.
# BUMP = patch (default) | minor | major. With no tag yet, prints server/package.json's version.
set -euo pipefail

latest=$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -n1)
if [ -z "$latest" ]; then
  node -p "require('./server/package.json').version"
  exit 0
fi
IFS=. read -r maj min pat <<< "${latest#v}"
case "${BUMP:-patch}" in
  major) echo "$((maj + 1)).0.0" ;;
  minor) echo "${maj}.$((min + 1)).0" ;;
  *)     echo "${maj}.${min}.$((pat + 1))" ;;
esac
