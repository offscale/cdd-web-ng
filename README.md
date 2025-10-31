cdd-web-ng
==========

[![License](https://img.shields.io/badge/license-MIT-blue)](https://opensource.org/licenses/MIT)
[![Tests and coverage](https://github.com/offscale/cdd-web-ng/actions/workflows/tests_and_coverage.yml/badge.svg)](https://github.com/offscale/cdd-web-ng/actions/workflows/tests_and_coverage.yml)
[![codecov](https://codecov.io/github/offscale/cdd-web-ng/graph/badge.svg?token=EtThJkGRA1)](https://codecov.io/github/offscale/cdd-web-ng)

**OpenAPI ↔ Angular**

`cdd-web-ng` is a powerful code generator that creates a modern, type-safe Angular client library and a feature-rich,
production-ready Admin UI directly from an OpenAPI v3 or Swagger v2 specification.

It leverages modern Angular features like standalone components, `inject()`, and Signals to produce clean, maintainable,
and high-quality code with minimal runtime dependencies.

## Key Features

- **Type-Safe Angular Client:** Generates `Injectable` services and TypeScript `interface` models for all API operations
  and schemas.
- **Automatic Admin UI:** Creates a complete, production-ready Angular Material CRUD interface for your API resources,
  including forms, tables, pagination, validation, and more.
- **Modern Angular Architecture:**
    - Outputs standalone components, directives, and pipes.
    - Uses `inject()` for dependency injection, eliminating constructors.
    - Leverages Signals for state management in generated components.
- **Robust & Maintainable:**
    - Uses **ts-morph** for AST-based code generation, ensuring syntactic correctness.
    - Core generation logic has **100% test coverage**.
- **Flexible Configuration:**
    - Usable as a CLI tool or programmatically in build scripts.
    - Supports configuration via a config file (`cdd-web-ng.config.js`) or command-line flags.

## Installation

```bash
npm install -g cdd-web-ng
```

## Usage

### 1. Command-Line Interface (CLI)

The easiest way to use the generator is via the `cdd_web_ng` command.

**Generate a Client Library and an Admin UI:**

```bash
cdd_web_ng from_openapi --input ./path/to/spec.yaml --output ./src/app/client --admin
```

**Generate Only the Client Library:**

```bash
cdd_web_ng from_openapi --input https://petstore3.swagger.io/api/v3/openapi.json --output ./src/app/client
```

### 2. Programmatic Usage

Integrate the generator into your own build scripts for more advanced control.

```typescript
// your-build-script.ts
import { generateFromConfig } from 'cdd-web-ng';

await generateFromConfig({
    input: 'path/to/spec.json',
    output: './src/generated/client',
    options: {
        // Generate the client library
        generateServices: true,
        // Also generate the admin UI
        admin: true,
        // Use native Date objects for date-time formats
        dateType: 'Date',
        // Generate string union types instead of enums
        enumStyle: 'union',
    }
});

console.log('Client and Admin UI generated successfully!');
```

### 3. Using the Generated Code

The generator creates a `provide...Client()` function for easy integration into your standalone Angular application.

**In your `app.config.ts`:**

```typescript
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideYourApiNameClient } from '../client'; // <-- Import the generated provider
import { adminRoutes } from '../client/admin/admin.routes'; // <-- Import the generated admin routes

export const appConfig: ApplicationConfig = {
    providers: [
        provideRouter([
            { path: 'admin', children: adminRoutes }, // <-- Add admin routes
            // ... your other app routes
        ]),
        provideHttpClient(withInterceptorsFromDi()),

        // Provide the API client configuration
        provideYourApiNameClient({
            basePath: 'https://api.example.com',
            // Optionally provide an API Key, Bearer Token, or custom interceptors
            // apiKey: 'YOUR_API_KEY',
        }),
    ],
};
```

## Feature Deep Dive

### Core Engine & Tooling

| Feature               | Details                                                                                                     |
|-----------------------|-------------------------------------------------------------------------------------------------------------|
| **OpenAPI Parsing**   | Supports **OpenAPI 3.x** & **Swagger 2.0**. Parses **JSON** & **YAML** from local files or remote URLs.     |
| **Code Generation**   | Uses **ts-morph** for robust AST manipulation, ensuring syntactically correct TypeScript.                   |
| **CLI**               | `cdd_web_ng` executable for easy script integration. Supports config files or direct flags.                 |
| **Project Structure** | Generates a clean output with directories for `models`, `services`, `admin`, `utils`, `auth`, and `tokens`. |

### Angular Client Library Generation

| Feature                  | Details                                                                                                                                   |
|--------------------------|-------------------------------------------------------------------------------------------------------------------------------------------|
| **Model Generation**     | Creates TypeScript `interface`s for schemas and `enum`s or union types for enumerations.                                                  |
| **Service Generation**   | Generates one Angular `Injectable` service per tag (`UsersService`, etc.) with methods for each operation.                                |
| **Method Signatures**    | Strongly-typed method parameters and full `HttpResponse` overloads (`observe: 'response'`).                                               |
| **Authentication**       | Generates an `AuthInterceptor` for **`apiKey`**, **`http`** (Bearer), and **`oauth2`**. Uses `InjectionToken`s for providing credentials. |
| **Dependency Injection** | Generates `provide...Client` functions for tree-shakable, multi-client setup via unique `InjectionToken`s.                                |
| **Utilities**            | Includes helpers for file downloads and an optional `DateInterceptor` for automatic date string conversion.                               |

### Auto-Generated Admin UI

The generator can create a complete CRUD interface for your API resources with zero manual configuration.

| Feature Category         | Details                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
|--------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Core Admin**           | **Resource Discovery:** Auto-identifies RESTful resources from API paths and tags. <br/> **Component Generation:** Creates standalone Angular Material **List** and **Form** views for each resource. <br/> **Routing:** Generates lazy-loaded feature routes for each resource.                                                                                                                                                                                                                                                                                                        |
| **Form Generation**      | **Dynamic Controls:** Maps schema properties to `MatInput`, `MatSelect`, `MatRadioGroup`, `MatDatepicker`, `MatChipList`, etc. <br/> **Complex Structures:** Handles nested `FormGroup`s and `FormArray`s. Ignores `readOnly` properties. <br/> **Validation:** Maps keywords like `required`, `minLength`, `pattern` to Angular `Validators`. Includes `CustomValidators` for `exclusiveMinimum`, `uniqueItems`, etc. <br/> **Polymorphism:** Creates dynamic forms for `oneOf`/`discriminator` schemas. <br/> **File Uploads:** Generates file input controls for `format: 'binary'`. |
| **List View Generation** | **Data Table:** Generates a `mat-table` with columns for model properties. <br/> **Pagination & Sorting:** Implements full server-side support using `MatPaginator` and `MatSort`. <br/> **Actions:** Includes "Edit", "Delete", and custom action buttons.                                                                                                                                                                                                                                                                                                                             |

## CLI Reference

<details>
<summary><b>cdd_web_ng from_openapi --help</b></summary>
<pre>
Usage: cdd_web_ng from_openapi [options]

Generate Angular services and admin UI from an OpenAPI specification

Options:
-c, --config <path>         Path to a configuration file (e.g., cdd-web-ng.config.js)
-i, --input <path>          Path or URL to the OpenAPI spec (overrides config)
-o, --output <path>         Output directory for generated files (overrides config)
--clientName <name>         Name for the generated client (used for DI tokens)
--dateType <type>           Date type to use (choices: "string", "Date")
--enumStyle <style>         Style for enums (choices: "enum", "union")
--admin Generate an Angular Material admin UI
--no-generate-services Disable generation of Angular services
-h, --help display help for command
</pre>
</details>

<details>
<summary><b>cdd_web_ng to_openapi --help</b></summary>
<pre>
Usage: cdd_web_ng to_openapi [options]

Generate an OpenAPI specification from TypeScript code (Not yet implemented)

Options:
-f, --file <path>  Path to the input TypeScript source file or directory
--format <format>  Output format for the OpenAPI spec (choices: "json", "yaml", default: "yaml")
-h, --help display help for command
</pre>
</details>

## Development

0. Clone the repository.
1. Install dependencies: `npm install`
2. Run tests: `npm test`
3. Build the project: `npm run build`

## Acknowledgement

This project extends upon foundational ideas for Angular client generation (`Services` only; no tests; no auto-admin)
from the MIT-licensed [ng-openapi-gen](https://github.com/ng-openapi/ng-openapi) project. Thanks
to [Tareq Jami (@Mr-Jami)](https://github.com/Mr-Jami).
