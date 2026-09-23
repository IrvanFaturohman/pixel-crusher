#!/bin/sh
# Build and publish dist/ to the gh-pages branch (served by GitHub Pages).
set -e
cd "$(dirname "$0")/.."
REMOTE="$(git remote get-url origin)"
npm run build
cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git commit -q -m "${DEPLOY_MSG:-Deploy $(git -C .. rev-parse --short HEAD)}"
git push -q -f "$REMOTE" gh-pages
rm -rf .git
echo "Deployed to gh-pages."
