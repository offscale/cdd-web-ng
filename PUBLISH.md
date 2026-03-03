# Publishing `cdd-web-ng`

This document outlines how to publish this compiler and its generated documentation.

## Publishing to npmjs

To publish the compiler package to npm:

1. Update the package version in `package.json`.
2. Ensure you are logged into npm via `npm login`.
3. Build the package:
    ```bash
    npm run build
    ```
4. Publish:
    ```bash
    npm publish
    ```

## Publishing API Documentation

### Generating Local Docs for Static Serving

Use Typedoc (as defined in `package.json`) to generate HTML docs:

```bash
npm run docs -- --out ./docs
```

The `./docs` directory now contains a static website that you can serve locally or deploy using tools like Nginx, Caddy, or simple file servers:

```bash
npx serve docs
```

### Uploading Docs to the Most Popular Location

For TypeScript/JavaScript packages, the most popular location to host docs is **GitHub Pages**.

You can automate this via GitHub Actions (e.g., a `.github/workflows/docs.yml` that checks out the repo, runs `npm run docs`, and pushes the `./docs` output to the `gh-pages` branch).
