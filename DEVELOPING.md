# Developing cdd-web-ng

## Setup Environment

1. Ensure you have **Node.js** 18 or later.
2. Install dependencies:
    ```bash
    npm install
    ```
3. Build the CLI:
    ```bash
    npm run build
    ```

## Architecture Map

- `src/openapi/parse.ts` - Entrypoint for parsing OpenAPI JSON/YAML to IR.
- `src/vendors/angular/` - Emitters for Angular.
- `src/vendors/fetch/` - Emitters for generic `fetch`.
- `src/functions/utils.ts` - Parsing TypeScript models and routes back to OpenAPI.
- `src/cli.ts` - CLI argument parsing and dispatching.

## Testing

Run tests locally using vitest:

```bash
npm run test
```

To run with coverage:

```bash
npm run test:coverage
```

## Adding new features

1. Pick an endpoint or model in `test-vanilla-fetch/` or `angular-client/`.
2. Ensure you have 100% test coverage for the code you add.
3. Keep logic highly modular. Separate classes and pure functions cleanly into `/src/{classes,functions,tests,mocks,openapi}`.
