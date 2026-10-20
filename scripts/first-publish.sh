#!/usr/bin/env bash
# One-time local publish of @noslop/cli: npm sets up trusted publishing (OIDC)
# only for a package that exists on the registry. Every later release is
# published by .github/workflows/main.yml.
set -euo pipefail

cd "$(dirname "$0")/.."

npm whoami >/dev/null || { echo "not logged in to npm; run: npm login" >&2; exit 1; }

name=$(jq -r .name apps/cli/package.json)
version=$(jq -r .version apps/cli/package.json)

if npm view "$name" version >/dev/null 2>&1; then
  echo "$name already exists on npm; releases go through CI, not this script" >&2
  exit 1
fi

bun install --frozen-lockfile
bun scripts/write-cli-package.ts
(cd apps/cli/dist && rm -f ./*.tgz && bun pm pack && npm publish ./*.tgz --access public)

cat <<EOF

published $name@$version

Now let CI release later versions:
  1. Open https://www.npmjs.com/package/$name/access
  2. Add Trusted Publisher -> GitHub Actions:
       organization or user: zgeoff
       repository:           noslop
       workflow filename:    main.yml
       environment:          (leave empty)
  3. In the repo's Settings -> Actions -> General, check "Allow GitHub Actions
     to create and approve pull requests".
  4. Set the RELEASE_ENABLED repo variable:
       gh variable set RELEASE_ENABLED --repo zgeoff/noslop --body true
EOF
