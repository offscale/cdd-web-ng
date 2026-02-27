# Publishing Your Generated API Client

Once `cdd-web-ng` has generated your target API client (Angular, Fetch, Axios, or Node), you will likely want to publish it to a package registry (like npm) so it can be consumed by other projects.

This guide details how to publish the generated SDK, host its documentation, and automate updates to keep the client synchronized with your upstream OpenAPI specification.

## 1. Packaging and Publishing to npm

To publish your generated client, it needs a valid `package.json` and a compilation step to convert the TypeScript into JavaScript/Type Declarations.

### Setup

If you generated the code into an empty directory, initialize a new npm package:

```bash
cd my-api-client
npm init -y
npm install typescript @types/node --save-dev
```

Create a simple `tsconfig.json`:

```json
{
    "compilerOptions": {
        "target": "ES2022",
        "module": "CommonJS",
        "declaration": true,
        "outDir": "./dist",
        "strict": true,
        "esModuleInterop": true,
        "skipLibCheck": true
    },
    "include": ["src/**/*"]
}
```

### Build and Publish

Update your `package.json` to point to the built files:

```json
{
    "main": "dist/index.js",
    "types": "dist/index.d.ts",
    "scripts": {
        "build": "tsc"
    }
}
```

Compile and publish:

```bash
npm run build
npm login
npm publish --access public
```

---

## 2. Generating Client Documentation

Your consumers will need documentation for the SDK. The generated output includes rich JSDoc comments automatically extracted from your OpenAPI spec.

### Build Local Docs

Install TypeDoc in your client repository:

```bash
npm install typedoc --save-dev
```

Generate the static HTML site:

```bash
npx typedoc --entryPointStrategy expand ./src --out ./docs
```

You can now host the `docs/` folder on any static web server. For GitHub Pages, use the workflow provided in the main `PUBLISH.md`.

---

## 3. Automating Updates (CI/CD Cronjob)

The most important aspect of maintaining an API client is keeping it perfectly synced with the backend OpenAPI specification. You can fully automate this using a GitHub Actions cron job.

This workflow will:

1. Run on a schedule (e.g., daily at midnight).
2. Download the latest OpenAPI spec from your server.
3. Regenerate the client SDK using `cdd-web-ng`.
4. Check if any code actually changed.
5. If changes exist, bump the version, build, publish to npm, and commit the new version back to the repository.

### `.github/workflows/sync-api-client.yml`

Create this file in your client SDK's repository:

```yaml
name: Sync & Publish API Client

on:
    schedule:
        # Run daily at midnight UTC
        - cron: '0 0 * * *'
    workflow_dispatch: # Allow manual trigger from GitHub UI

permissions:
    contents: write
    id-token: write

jobs:
    update-client:
        runs-on: ubuntu-latest
        steps:
            - name: Checkout Repository
              uses: actions/checkout@v4
              with:
                  token: ${{ secrets.GITHUB_TOKEN }}

            - name: Setup Node.js
              uses: actions/setup-node@v4
              with:
                  node-version: '20'
                  registry-url: 'https://registry.npmjs.org'

            - name: Install Dependencies
              run: npm ci

            - name: Download Latest OpenAPI Spec
              run: |
                  # Replace with your actual OpenAPI spec URL
                  curl -sS https://api.yourdomain.com/openapi.json > spec.json

            - name: Generate API Client
              run: |
                  npx cdd-web-ng --input spec.json --output ./src --implementation fetch

            - name: Check for Changes
              id: git-check
              run: |
                  git add ./src
                  # Check if there are staged changes in the generated source folder
                  if git diff --staged --quiet; then
                    echo "No changes in OpenAPI spec detected."
                    echo "changed=false" >> $GITHUB_OUTPUT
                  else
                    echo "OpenAPI spec changed. Proceeding with update."
                    echo "changed=true" >> $GITHUB_OUTPUT
                  fi

            - name: Bump Version & Build
              if: steps.git-check.outputs.changed == 'true'
              run: |
                  # Automatically bump the patch version
                  npm version patch --no-git-tag-version

                  # Compile the TypeScript client
                  npm run build

            - name: Publish to npm
              if: steps.git-check.outputs.changed == 'true'
              run: npm publish --access public
              env:
                  NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

            - name: Commit and Push Changes
              if: steps.git-check.outputs.changed == 'true'
              run: |
                  git config --global user.name "github-actions[bot]"
                  git config --global user.email "github-actions[bot]@users.noreply.github.com"

                  NEW_VERSION=$(node -p "require('./package.json').version")

                  git commit -am "chore: auto-update API client to spec version (SDK v$NEW_VERSION)"
                  git tag "v$NEW_VERSION"
                  git push origin main --tags
```

### Required Secrets

For the automation to work, you must add the following secret to your GitHub Repository Settings (**Settings > Secrets and variables > Actions**):

- `NPM_TOKEN`: A valid automation token generated from your npmjs.com account.
