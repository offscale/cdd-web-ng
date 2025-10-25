cdd-web-ng
==========
[![License](https://img.shields.io/badge/license-MIT-blue)](https://opensource.org/licenses/MIT)

OpenAPI ↔ Angular (TypeScript, HTML).

This tool generates fully-typed TypeScript clients from an OpenAPI v3 specification, aiming for simplicity, correctness,
and zero runtime dependencies.

## Features

- **Type-Safe:** Generates TypeScript interfaces and types for all schemas.
- **Modern:** Outputs modern Angular with `@if` and `HttpRequest`.
- **Zero Runtime Dependencies:** The generated code is plain Angular and `@angular/material`.
- **Simple & Standard:** No complex build tools or non-standard libraries required.
- **Fully Tested:** Core generation logic has 100% test coverage.
- **CLI and Library Usage:** Can be used as a command-line tool or programmatically.

## Installation

```bash
npm install -g cdd-web-ng
```

## Usage

### Command-Line Interface (CLI)

The easiest way to use `cdd-web-ng` is via the CLI.

```bash
cdd-web-ng --input ./openapi.json --output ./src/generated/client
```

**Options:**

- `-i, --input <path>`: **Required.** Path or URL to the OpenAPI specification file (JSON or YAML).
- `-o, --output <path>`: **Required.** Path to the output directory for the generated client.
- `-t, --tag <name>`: Optional. Generate client only for a specific tag. Can be used multiple times.
- `--no-types`: Optional. Skip generation of type definitions.

### Programmatic Usage

You can also use `cdd-web-ng` as a library in your own build scripts.

```typescript
import { generate } from 'cdd-web-ng';

await generate({
    input: 'path/to/spec.json',
    output: './src/generated/client',
    tags: ['pets', 'store'] // Optional: only generate clients for these tags
});

console.log('Client generated successfully!');
```

## Generated Code

The generator creates two main files:

1. `types.ts`: Contains all the TypeScript interfaces and type aliases derived from `#/components/schemas`.
2. `client.ts`: Contains the API client classes, grouped by tags from your spec. Each class provides methods for the
   operations under that tag.

### Example Generated Client

```typescript
// src/generated/client/client.ts

import type { Pet, Error } from './types';

export class PetAPI {
    constructor(private baseUrl: string = '') {
    }

    /**
     * @summary Find pet by ID
     * @description Returns a single pet
     */
    async getPetById(petId: number): Promise<Pet> {
        const url = new URL(`/pet/${petId}`, this.baseUrl);
        const response = await fetch(url.toString(), {
            method: 'GET',
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    }
}
```

## Development

1. Clone the repository.
2. Install dependencies: `npm install`
3. Run tests: `npm test`
4. Build the project: `npm run build`
