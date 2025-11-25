# Guide to Extending the Code Generator

This document provides instructions on how to extend the generator to support new frameworks (like React or Vue) and new
HTTP clients (like Axios).

## Architectural Overview

The generator is built on a clean, three-layer architecture designed for extensibility:

1. **Core Layer (`src/core`)**: Parses the OpenAPI specification. This layer is completely framework-agnostic.
2. **Analysis / IR Layer (`src/analysis`)**: Analyzes the parsed spec and converts it into a framework-agnostic *
   *Intermediate Representation (IR)**. This IR provides a simple, abstract model of services, forms, lists, and
   validation rules. This is the key to decoupling.
3. **Generation Layer (`src/generators`)**: Consumes the IR and generates framework-specific code. All
   framework-specific logic is isolated here.

To add support for a new technology, you will primarily be working in the **Generation Layer**.

---

## How to Add a New Framework (e.g., React)

Adding a new framework like React involves creating a new set of generators that consume the existing IR from the
`src/analysis` layer and emit React-specific code (e.g., TypeScript with JSX).

### 1. Create the Framework Directory

Create a new directory for your framework inside `src/generators`.

```
src/generators/
└── react/
    ├── admin/
    │   ├── form-component.generator.ts
    │   └── list-component.generator.ts
    ├── service/
    │   ├── service.generator.ts
    │   └── service-method.generator.ts
    └── react-client.generator.ts
```

### 2. Implement the Main Client Generator

Create `src/generators/react/react-client.generator.ts`. This file will be the main orchestrator for your framework's
code generation. It must implement the `IClientGenerator` interface. You can use
`src/generators/angular/angular-client.generator.ts` as a reference.

```typescript
// src/generators/react/react-client.generator.ts

import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types/index.js';
import { AbstractClientGenerator } from '../../core/generator.js';
import { TypeGenerator } from '../shared/type.generator.js'; // Re-use this!

export class ReactClientGenerator extends AbstractClientGenerator {
    public async generate(project: Project, parser: SwaggerParser, config: GeneratorConfig, outputDir: string): Promise<void> {
        // 1. Generate Models (re-use the shared generator)
        new TypeGenerator(parser, project, config).generate(outputDir);
        console.log('✅ Models generated.');

        // 2. Generate React Hooks for Services
        // const serviceGenerator = new ReactServiceGenerator(...);
        // serviceGenerator.generateAll(outputDir);

        // 3. Generate React Admin Components (if applicable)
        // if (config.options.admin) {
        //     const adminGenerator = new ReactAdminGenerator(...);
        //     adminGenerator.generate(outputDir);
        // }

        console.log(`🎉 React client generation complete!`);
    }
}
```

### 3. Wire Up the New Generator

You need to tell the main entry points about your new generator.

#### In `src/cli.ts`:

Add `'react'` to the `framework` option's choices.

```typescript
// src/cli.ts
// ... inside the 'from_openapi' command definition
.
addOption(new Option('--framework <framework>', 'Target framework').choices(['angular', 'react', 'vue']))
```

#### In `src/index.ts`:

Add a `case` for `'react'` in the `getGeneratorFactory` function.

```typescript
// src/index.ts
import { ReactClientGenerator } from './generators/react/react-client.generator.js';

function getGeneratorFactory(framework: string): IClientGenerator {
    switch (framework) {
        case 'angular':
            return new AngularClientGenerator();
        case 'react':
            return new ReactClientGenerator(); // Add this line
        // ...
    }
}
```

### 4. Implement the Service Generator

Your React service generator will generate hooks instead of Angular services.

1. Create `src/generators/react/service/service-method.generator.ts`.
2. Use the `ServiceMethodAnalyzer` from `src/analysis` to get the `ServiceMethodModel` (the IR).
3. Use this model to generate a custom hook (e.g., `useGetUserById`) that uses an HTTP client like `fetch` or `axios`.

**Example Logic:**

```typescript
// Inside your React Service Method Generator
import { ServiceMethodAnalyzer } from '@src/analysis/service-method-analyzer.ts';
// ...
const analyzer = new ServiceMethodAnalyzer(this.config, this.parser);
const model = analyzer.analyze(operation); // model is the framework-agnostic IR

// Now, generate React-specific hook code from the 'model'
const hookCode = `
export const use${pascalCase(model.methodName)} = () => {
  // ... logic to call fetch/axios using model.urlTemplate, model.httpMethod etc.
};
`;
```

### 5. Implement Admin UI Generators (Optional)

If you want to generate an admin UI:

1. Use `FormModelBuilder` and `ListModelBuilder` from `src/analysis` to get the `FormAnalysisResult` and
   `ListViewModel`.
2. Create React-specific generators that consume this IR to produce JSX.
3. You will need to create a **React-specific renderer for validation**. For example, create a `ValidationRenderer` that
   converts the `ValidationRule[]` IR into a `Yup` schema for use with Formik.

---

## How to Add a New HTTP Client (e.g., Axios)

This change is much simpler as it's localized within a specific framework's generator. Here’s how to do it for the
existing Angular generator.

### 1. Locate the HTTP Call Logic

The code that makes the actual HTTP request is located in:
`src/generators/angular/service/service-method.generator.ts`

Specifically, look inside the `emitMethodBody` private method.

### 2. Find the `http.request` Lines

At the end of the `emitMethodBody` method, you will find lines like these:

```typescript
// src/generators/angular/service/service-method.generator.ts

// ... inside emitMethodBody
// 10. HTTP Call
// ...
if (isStandardBody) {
    if (httpMethod === 'query') {
        lines.push(`return this.http.request('QUERY', url, { ...requestOptions, body: ${bodyArgument} } as any);`);
    } else {
        lines.push(`return this.http.${httpMethod}(url, ${bodyArgument}, requestOptions as any);`);
    }
} else if (isStandardNonBody) {
    lines.push(`return this.http.${httpMethod}(url, requestOptions as any);`);
} else {
    lines.push(`return this.http.request('${model.httpMethod}', url, requestOptions as any);`);
}
```

### 3. Replace the Logic

Replace the `this.http.*` calls with your desired client's syntax.

**To switch to Axios, you would:**

1. Change the imports at the top of `src/generators/angular/service/service.generator.ts` to import `axios` and `from`
   from `rxjs` (to wrap the Promise in an Observable).
2. Modify the `emitMethodBody` logic to build an `axios` config object and make the call.

**Example Change (Conceptual):**

```typescript
// Conceptual change in service-method.generator.ts

// ... build url, params, headers, bodyArgument ...

// OLD:
// lines.push(`return this.http.get(url, requestOptions as any);`);

// NEW (for Axios):
lines.push(`const config = { headers, params };`);
lines.push(`return from(axios.get(url, config));`);
```

You would need to adapt the `requestOptions` object to the format expected by Axios. You could also add a configuration
option in `config.ts` to let the user choose which HTTP client to generate code for.
