# Developing `cdd-web-ng`

Thank you for your interest in contributing! This document details how to set up your local development environment, run tests, and maintain code quality when working on the `cdd-web-ng` compiler.

## Prerequisites

- **Node.js**: v18 or later.
- **npm**: v9 or later.

## Setup

1. **Clone the repository**:

    ```bash
    git clone https://github.com/offscale/cdd-web-ng.git
    cd cdd-web-ng
    ```

2. **Install dependencies**:
    ```bash
    npm ci
    ```

## Project Structure

The codebase is organized into modular phases representing the architecture of the compiler:

- **`src/cli.ts`**: The CLI entrypoint using Commander.js.
- **`src/index.ts`**: The main programmatic SDK export barrel and generation orchestrator.
- **`src/openapi/`**: The frontend parsers and AST validators for OpenAPI specs.
- **`src/core/`**: Core types, configurations, and the Abstract Generator interfaces.
- **`src/classes/`, `src/routes/`, `src/functions/`**: Abstract components of the universal Intermediate Representation (IR) and shared emitter utilities.
- **`src/vendors/`**: The backend emitters specific to a given transport/framework plugin.
    - `angular/`
    - `fetch/`
    - `axios/`
    - `node/`

## Running Tests

We use [Vitest](https://vitest.dev/) for unit and integration testing. Maintaining 100% test coverage is a strict requirement for all pull requests.

### Run All Tests

```bash
npm run test
```

### Run Tests with Coverage Report

Generates an istanbul code coverage report in the `coverage/` folder.

```bash
npm run test -- --coverage
```

### Run Tests in Watch Mode

Ideal for continuous feedback during development:

```bash
npm run test -- --watch
```

## Adding a New Transport Implementation

If you want to add a new backend emitter (e.g., `vue`, `react-query`, or `rust`):

1. Add your implementation flag to `src/core/types/config.ts` and `src/cli.ts`.
2. Update the `getGeneratorFactory` router in `src/index.ts`.
3. Create your vendor folder under `src/vendors/<your-transport>/`.
4. Create an orchestrator extending `AbstractClientGenerator` (see `src/vendors/fetch/fetch-client.generator.ts` for an example).
5. Implement an `AbstractServiceGenerator` to emit the actual TypeScript class syntax using `ts-morph`.
6. Use the `ServiceMethodAnalyzer` (from `src/functions/parse_analyzer.ts`) to easily extract paths, query/body params, serialization rules, and return types.
7. Add a full test suite under `tests/<folder-number>-<your-transport>-generator/` and ensure 100% code coverage.

## Code Standards & Style

- **AST Manipulation**: We strictly use [ts-morph](https://ts-morph.com/) for TypeScript generation. **Do not** write static `.ts` files as strings and save them via `fs.writeFile`. You must build the AST via the `Project` or `SourceFile` APIs so the compiler can validate, format, and strictly type check the output.
- **Formatting**: The project uses Prettier and ESLint. Ensure your code is properly formatted before committing.
- **Docstrings**: We strive for 100% JSDoc coverage on all exported classes, methods, and properties. When adding new API surfaces, always document their purpose, arguments, and return types.
