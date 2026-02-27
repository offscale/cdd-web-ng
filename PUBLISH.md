# Publishing `cdd-web-ng`

This guide explains how to publish the `cdd-web-ng` CLI and generator package to npm, and how to generate and host its documentation.

## 1. Publishing to npmjs

The Node Package Manager (npm) is the standard registry for TypeScript/JavaScript ecosystem tools.

### Prerequisites

- You must have an active [npmjs.com](https://www.npmjs.com/) account.
- Authenticate your local environment:
    ```bash
    npm login
    ```

### Publishing Steps

1. **Ensure the working tree is clean and tests pass:**
    ```bash
    npm run test
    ```
2. **Build the project:**
   Compile the TypeScript files to JavaScript.
    ```bash
    npm run build
    ```
3. **Bump the version:**
   Use the npm version command to increment the package version (patch, minor, or major) and create a git tag:
    ```bash
    npm version patch # or minor / major
    ```
4. **Publish the package:**
   Push the compiled package to the npm registry.
    ```bash
    npm publish --access public
    ```
5. **Push tags to source control:**
    ```bash
    git push origin main --tags
    ```

---

## 2. Generating Local Documentation

This project uses [TypeDoc](https://typedoc.org/) (configured via `typedoc.json`) to parse the TypeScript source and generate a static HTML documentation site.

### Build Local Docs

Run the documentation generation script:

```bash
npx typedoc
```

_This command reads `tsconfig.json` and outputs a static HTML website into the `docs/` directory._

### View Local Docs

You can serve the folder locally to view it:

```bash
npx serve docs/
```

Open your browser to `http://localhost:3000` to browse the generated API documentation.

---

## 3. Publishing Documentation to GitHub Pages

GitHub Pages is the most popular, free hosting location for open-source documentation. You can automate the publication of your TypeDoc output using GitHub Actions.

### Setup GitHub Actions for Pages

1. Go to your GitHub repository settings: **Settings > Pages**.
2. Set the **Source** to **GitHub Actions**.
3. Create a workflow file at `.github/workflows/docs.yml`:

```yaml
name: Deploy Documentation to GitHub Pages

on:
    push:
        branches: ['main']
    workflow_dispatch:

permissions:
    contents: read
    pages: write
    id-token: write

concurrency:
    group: 'pages'
    cancel-in-progress: false

jobs:
    deploy:
        environment:
            name: github-pages
            url: ${{ steps.deployment.outputs.page_url }}
        runs-on: ubuntu-latest
        steps:
            - name: Checkout
              uses: actions/checkout@v4

            - name: Setup Node.js
              uses: actions/setup-node@v4
              with:
                  node-version: '20'
                  cache: 'npm'

            - name: Install dependencies
              run: npm ci

            - name: Build Docs
              run: npx typedoc

            - name: Setup Pages
              uses: actions/configure-pages@v4

            - name: Upload artifact
              uses: actions/upload-pages-artifact@v3
              with:
                  path: './docs'

            - name: Deploy to GitHub Pages
              id: deployment
              uses: actions/deploy-pages@v4
```

Now, every time you push to `main`, the documentation will automatically build and publish to `https://<your-username>.github.io/cdd-web-ng/`.
