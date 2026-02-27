# `cdd-web-ng` Usage Guide

This document describes how to configure and execute the `cdd-web-ng` code generator.

## Basic Usage

The primary function of the generator is the `from_openapi` command. It reads an OpenAPI specification (v2.0 or v3.0+) and emits a fully typed API client.

```bash
npx cdd-web-ng from_openapi --input <path/to/spec.json> --output <path/to/output> [options]
```

### Required Arguments

- `--input <path>`: Local file path or valid URL pointing to your `openapi.json` or `openapi.yaml`.
- `--output <path>`: Output directory where the generated client will be placed.

### Common Options

- `--clientName <name>`: Prefix for the generated API module (e.g., `--clientName MyApi` generates `MyApiModule`, `MyApiService`).
- `--implementation <type>`: Choose the underlying HTTP implementation.
    - `angular` (default): Emits Angular `HttpClient` services, RxJS observables, and Dependency Injection providers.
    - `fetch`: Emits native `fetch` promises, ideal for Vanilla JS, React, Vue, or modern browser extensions.
    - `axios`: Emits `axios` promises and requires `axios` as a peer dependency.
    - `node`: Emits pure Node.js `node:http`/`node:https` clients. Excellent for backend-to-backend communication without extra dependencies.
- `--admin`: Generates a fully functional Angular Auto-Admin UI based on the API models. _(Note: Only supported when `--implementation` is `angular`)_.
- `--dateType <type>`: Determines how string-dates are represented in models. Choices are `string` (default) or `Date`.

### Example CLI Workflows

**1. Generating a React/Vanilla JS Client:**

```bash
npx cdd-web-ng from_openapi --input https://petstore.swagger.io/v2/swagger.json --output ./src/api --implementation fetch
```

**2. Generating an Angular Client with an Auto-Admin Dashboard:**

```bash
npx cdd-web-ng from_openapi --input ./docs/openapi.yaml --output ./src/app/core/api --implementation angular --admin
```

**3. Generating a Node.js Backend Microservice Client:**

```bash
npx cdd-web-ng from_openapi --input ./docs/internal-api.json --output ./src/libs/external-api --implementation node
```

## Programmatic Execution (SDK)

If you prefer using code instead of shell commands (useful in build scripts like gulp or esbuild), `cdd-web-ng` exports a Node.js SDK.

### `generateFromConfig(config: GeneratorConfig)`

```ts
import { generateFromConfig } from 'cdd-web-ng';

async function generateClient() {
    await generateFromConfig({
        input: 'https://api.example.com/openapi.json',
        output: './src/api-client',
        clientName: 'ExampleClient',
        options: {
            implementation: 'axios',
            dateType: 'string',
            generateServices: true, // Generate endpoints (default true)
            // admin: false
        },
    });
    console.log('✅ Client successfully generated!');
}

generateClient();
```

## Advanced Config Options (`GeneratorConfigOptions`)

When using the programmatic SDK, the `options` object supports deeper customization:

- `options.implementation`: `'angular' | 'fetch' | 'axios' | 'node'` (Default: `'angular'`)
- `options.admin`: `boolean` - Generates Angular-based UI components.
- `options.generateServices`: `boolean` - Set to `false` if you only want the interface models and not the HTTP transport classes.
- `options.generateServiceTests`: `boolean` - If true, emits `.spec.ts` files alongside the services.
- `options.dateType`: `'string' | 'Date'` (Default: `'string'`)
- `options.enumStyle`: `'enum' | 'union'` (Default: `'union'`) - Output enums as real TS Enums or union types.
- `options.compilerOptions`: Override `ts-morph` compiler settings used during AST emission.

## Understanding Output Structure

Regardless of the implementation chosen, the fundamental directory structure remains consistent:

```text
my-output-dir/
├── index.ts               # Primary export barrel (use this to import everything)
├── models/                # Interfaces & Types parsed from components.schemas
│   ├── index.ts
│   ├── User.ts
│   └── Pet.ts
├── services/              # HTTP classes mapped from operations/tags
│   ├── index.ts
│   ├── Users.service.ts
│   └── Pets.service.ts
└── utils/                 # Implementation-specific helpers
    ├── parameter-serializer.ts
    └── server-url.ts
```

_When `--admin` is true (Angular only), an additional `admin/` folder will be generated containing UI components._
