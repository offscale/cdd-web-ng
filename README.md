cdd-web-ng
==========
[![License](https://img.shields.io/badge/license-MIT-blue)](https://opensource.org/licenses/MIT)

OpenAPI ↔ Angular (TypeScript, HTML).

This tool generates fully-typed TypeScript clients from an OpenAPI v3 specification, aiming for simplicity, correctness,
and few runtime dependencies.

## Features

- **Type-Safe:** Generates TypeScript interfaces and types for all schemas.
- **Modern:** Outputs modern Angular with `@if`, `inject`, `signal`, and `HttpRequest`.
- **Few Runtime Dependencies:** The generated code is plain Angular and `@angular/material`.
- **Simple & Standard:** Only 3 (major) non-standard libraries depended on:
    - [vitetest](https://github.com/vitest-dev/vitest) (testing);
    - [commander](https://github.com/tj/commander.js) (CLI);
    - [rolldown](https://github.com/rolldown/rolldown) (bundler); and
    - [ts-morph](https://github.com/dsherret/ts-morph) (AST manipulation, parsing, and emission).
- **Fully Tested:** Core generation logic has 100% test coverage.
- **CLI and Library Usage:** Can be used as a command-line tool or programmatically.

## CLI

```sh
npm run build && npm install -g .
```

Then you can run, `cdd_web_ng --help`:

```
Usage: cdd_web_ng [options] [command]

OpenAPI ↔ Angular (TypeScript, HTML) code generator

Options:
  -V, --version           output the version number
  -h, --help              display help for command

Commands:
  from_openapi [options]  Generate Angular services and admin UI from an OpenAPI specification
  to_openapi [options]    Generate an OpenAPI specification from TypeScript code (Not yet implemented)
  help [command]          display help for command
```

### `from_openapi`

```
Usage: cdd_web_ng from_openapi [options]

Generate Angular services and admin UI from an OpenAPI specification

Options:
  -c, --config <path>  Path to a configuration file (e.g., cdd-web-ng.config.js)
  -i, --input <path>   Path or URL to the OpenAPI spec (overrides config)
  -o, --output <path>  Output directory for generated files (overrides config)
  --clientName <name>  Name for the generated client (used for DI tokens)
  --dateType <type>    Date type to use (choices: "string", "Date")
  --enumStyle <style>  Style for enums (choices: "enum", "union")
  --admin              Generate an Angular Material admin UI
  --generate-services  Generate Angular services (default: true)
  -h, --help           display help for command
```

### `to_openapi`

```
Usage: cdd_web_ng to_openapi [options]

Generate an OpenAPI specification from TypeScript code

Options:
  -f, --file <path>  Path to the input TypeScript source file or directory
  --format <format>  Output format for the OpenAPI spec (choices: "json",
                     "yaml", default: "yaml")
  -h, --help         display help for command
```

### Core & Tooling Features

This table covers the foundational capabilities of the code generation engine and its command-line interface.

| Feature                    | Support Level / Details                                                                                                                                                          |
|----------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **OpenAPI Parsing**        | Supports **OpenAPI 3.x** and **Swagger 2.0**. <br/> Parses both **JSON** and **YAML** formats. <br/> Can load specifications from a local file or a remote URL.                  |
| **Code Generation Engine** | Uses **ts-morph** for robust and type-safe TypeScript code generation. <br/> Outputs modern, standalone Angular components and services using `inject()` and Signals.            |
| **Command-Line Interface** | Provides an `oag` executable for easy integration into build scripts. <br/> Supports configuration via a JS/TS config file or direct command-line flags (`--input`, `--output`). |
| **Project Structure**      | Generates a clean, well-organized output with separate directories for `models`, `services`, `admin`, `utils`, `auth`, and `tokens`.                                             |

### Angular Client Library Generation

The generator creates a fully typed, ready-to-use client library for interacting with your API.

| Feature                  | Support Level / Details                                                                                                                                                                                       | OpenAPI Spec Section(s)                                 |
|--------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------|
| **Model Generation**     | Creates TypeScript `interface`s for schemas. <br/> Supports `enum`s (as TS enums or union types). <br/> Handles composition with `allOf`.                                                                     | `Schema Object`, `Components Object`                    |
| **Service Generation**   | Generates one Angular `Injectable` service per tag (`UsersService`, etc.). <br/> Creates methods for each API operation, using `operationId` for naming.                                                      | `Paths Object`, `Operation Object`                      |
| **Method Signatures**    | Generates strongly-typed method parameters. <br/> Includes method overloads for `observe: 'body' \| 'response' \| 'events'` to allow full access to `HttpResponse`.                                           | `Operation Object`, `Parameter Object`                  |
| **Parameter Handling**   | Supports parameters in `path`, `query`, and `header`. <br/> Includes an `HttpParamsBuilder` utility to correctly handle complex/nested objects in query strings.                                              | `Parameter Object`                                      |
| **Authentication**       | Generates a dedicated `AuthInterceptor`. <br/> Supports **`apiKey`** (in header & query), **`http`** (Bearer Token), and **`oauth2`**. <br/> Creates `InjectionToken`s for providing credentials dynamically. | `Security Scheme Object`, `Security Requirement Object` |
| **Dependency Injection** | Generates `provide...Client` functions for easy setup in `app.config.ts`. <br/> Uses unique `InjectionToken`s for `basePath` and client-specific `HttpInterceptor`s, enabling multi-client support.           | (Angular Integration)                                   |
| **Utility Generation**   | Creates a helper for browser-based file downloads. <br/> Generates an optional `DateInterceptor` to automatically convert date strings in responses to `Date` objects.                                        | (Developer Experience)                                  |

### Auto-Admin UI Generation

This is the standout feature of the project, creating a complete CRUD interface for your API resources with minimal
configuration.

| Feature Category         | Feature                                    | Support Level / Details                                                                                                                                                                                                                                                                                                                                                                                                | OpenAPI Spec Section(s)                             |
|--------------------------|--------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------|
| **Core Admin**           | **Resource Discovery**                     | Automatically identifies RESTful resources from API paths and tags. <br/> Distinguishes between editable (CRUD) and read-only resources.                                                                                                                                                                                                                                                                               | `Paths Object`, `Tag Object`                        |
|                          | **Component Generation**                   | Generates modern, standalone Angular components for **List** and **Form** views for each resource.                                                                                                                                                                                                                                                                                                                     | (Implementation Detail)                             |
|                          | **Routing**                                | Generates feature-level routing (`books.routes.ts`) and a master `admin.routes.ts` with a default redirect. <br/> Correctly handles routing for read-only and create-only resources.                                                                                                                                                                                                                                   | (Implementation Detail)                             |
| **Form Generation**      | **Dynamic Form Controls**                  | Maps schema properties to a rich set of Angular Material components: <br/> • `MatInput` (`string`, `number`) <br/> • `Textarea` (`format: textarea`) <br/> • `MatSelect` (large enums) <br/> • `MatRadioGroup` (small enums) <br/> • `MatButtonToggleGroup` (`boolean`) <br/> • `MatDatepicker` (`format: date`) <br/> • `MatChipList` (`array` of `string`s) <br/> • `MatSlider` (`integer` with `minimum`/`maximum`) | `Schema Object` (`type`, `format`, `enum`, etc.)    |
|                          | **Complex Structures**                     | Generates nested `FormGroup`s for object properties. <br/> Generates `FormArray` for arrays of objects, including helper methods (`add`, `remove`). <br/> Correctly ignores `readOnly` properties in forms.                                                                                                                                                                                                            | `Schema Object` (`properties`, `items`, `readOnly`) |
|                          | **Validation**                             | Maps standard keywords (`required`, `minLength`, `maxLength`, `pattern`, `minimum`, `maximum`) to built-in Angular `Validators`. <br/> Generates a `CustomValidators` file for advanced keywords: `exclusiveMinimum/Maximum`, `multipleOf`, `uniqueItems`.                                                                                                                                                             | `Schema Object`                                     |
|                          | **Polymorphism (`oneOf`/`discriminator`)** | Creates dynamic forms that change based on a discriminator property (`<mat-select>`). <br/> Conditionally shows/hides sub-forms for each polymorphic type. <br/> Correctly merges and reconstructs the data payload on submit.                                                                                                                                                                                         | `Schema Object`, `Discriminator Object`             |
|                          | **File Uploads**                           | Generates a file input control for properties with `type: 'string', format: 'binary'`. <br/> The component manages the `File` object directly within the `FormGroup`.                                                                                                                                                                                                                                                  | `Schema Object`                                     |
| **List View Generation** | **Data Table & Actions**                   | Generates an Angular Material Table (`<mat-table>`) with columns for model properties. <br/> Includes "Edit" and "Delete" action buttons for editable resources. <br/> Supports custom actions (e.g., `/servers/{id}/reboot`).                                                                                                                                                                                         | `Schema Object` (`properties`)                      |
|                          | **Pagination & Sorting**                   | Implements full server-side pagination and sorting via `MatPaginator` and `MatSort`. <br/> Calls list endpoints with standard `_page`, `_limit`, `_sort`, `_order` params. <br/> Reads the `X-Total-Count` header for total item count.                                                                                                                                                                                | `Parameter Object`, `Response Object` (`headers`)   |

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

0. Clone the repository.
1. Install dependencies: `npm install`
2. Run tests: `npm test`
3. Build the project: `npm run build`

## Acknowledgement

The service templates and ts-morph usage for Angular client generation was originally done in the MIT
licensed https://github.com/ng-openapi/ng-openapi - thanks @Mr-Jami

(before being extended here with: more ts-morph usage; test generation; greater documentation coverage; greater test
coverage; admin UI generation; auth implementation; and better OpenAPI conformance; &etc.)
