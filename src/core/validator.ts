// src/core/validator.ts

import { SwaggerSpec } from "@src/core/types/index.js";

/**
 * Error thrown when the OpenAPI specification fails validation.
 */
export class SpecValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SpecValidationError';
    }
}

/**
 * Normalizes a path template to a generic signature for collision detection.
 *
 * Example:
 * - "/users/{id}/details" -> "/users/{}/details"
 * - "/users/{name}/details" -> "/users/{}/details"
 *
 * @param path The URL template path.
 * @returns A normalized signature string.
 */
function getPathTemplateSignature(path: string): string {
    return path.split('/').map(segment => {
        if (segment.startsWith('{') && segment.endsWith('}')) {
            return '{}';
        }
        return segment;
    }).join('/');
}

/**
 * Validates that a parsed object conforms to the basic structure of a Swagger 2.0 or OpenAPI 3.x specification.
 * Checks for:
 * - Valid version string ('swagger: "2.x"' or 'openapi: "3.x"')
 * - "info" object with "title" and "version"
 * - At least one functional root property ("paths", "components", or "webhooks")
 * - License Object constraints (mutually exclusive `url` and `identifier`)
 * - Strict regex compliance for component keys (OAS 3.x)
 * - Path Template Hierarchy collisions (OAS 3.2)
 *
 * @param spec The parsed specification object.
 * @throws {SpecValidationError} if the specification is invalid.
 */
export function validateSpec(spec: SwaggerSpec): void {
    if (!spec) {
        throw new SpecValidationError("Specification cannot be null or undefined.");
    }

    // 1. Check Version Header
    const isSwag2 = typeof spec.swagger === 'string' && spec.swagger.startsWith('2.');
    const isOpenApi3 = typeof spec.openapi === 'string' && spec.openapi.startsWith('3.');

    if (!isSwag2 && !isOpenApi3) {
        throw new SpecValidationError("Unsupported or missing OpenAPI/Swagger version. Specification must contain 'swagger: \"2.x\"' or 'openapi: \"3.x\"'.");
    }

    // 2. Check Info Object
    if (!spec.info) {
        throw new SpecValidationError("Specification must contain an 'info' object.");
    }
    if (!spec.info.title || typeof spec.info.title !== 'string') {
        throw new SpecValidationError("Specification info object must contain a required string field: 'title'.");
    }
    if (!spec.info.version || typeof spec.info.version !== 'string') {
        throw new SpecValidationError("Specification info object must contain a required string field: 'version'.");
    }

    // 3. Check License Object Constraints (OAS 3.1+)
    // "The `identifier` field is mutually exclusive of the `url` field."
    if (spec.info.license) {
        // OAS 3.2/3.1 Strictness: checking logical existence rather than falsy values to avoid edge cases with empty strings,
        // though empty strings would be invalid URIs anyway.
        const hasUrl = spec.info.license.url !== undefined && spec.info.license.url !== null;
        const hasIdentifier = spec.info.license.identifier !== undefined && spec.info.license.identifier !== null;

        if (hasUrl && hasIdentifier) {
            throw new SpecValidationError("License object cannot contain both 'url' and 'identifier' fields. They are mutually exclusive.");
        }
    }

    // 4. Path Template Hierarchy Validation (OAS 3.2 Requirement)
    // "Templated paths with the same hierarchy but different templated names MUST NOT exist as they are identical."
    // This check applies generally to avoid ambiguity in router generation for both OAS 3 and Swagger 2.
    if (spec.paths) {
        const signatures = new Map<string, string>(); // Signature -> Original Path key

        for (const pathKey of Object.keys(spec.paths)) {
            const signature = getPathTemplateSignature(pathKey);

            // If the path doesn't contain templates, collision logic strictly relies on identical strings which JSON parse handles (last wins).
            // However, we primarily care about {a} vs {b}.
            if (!signature.includes('{}')) {
                continue;
            }

            if (signatures.has(signature)) {
                const existingPath = signatures.get(signature)!;
                // Throw if they are different string constants mapping to the same signature
                if (existingPath !== pathKey) {
                    throw new SpecValidationError(
                        `Ambiguous path definition detected. OAS 3.2 forbids identical path hierarchies with different parameter names.\n` +
                        `Path 1: "${existingPath}"\n` +
                        `Path 2: "${pathKey}"`
                    );
                }
            } else {
                signatures.set(signature, pathKey);
            }
        }
    }

    // 5. Check Structural Root
    // Per OAS 3.2: "at least one of the components, paths, or webhooks fields MUST be present."
    // For Swagger 2.0: 'paths' is technically required.

    // Note: We treat empty objects as "present" for the sake of validation,
    // as empty APIs are technically valid (though useless).
    const hasPaths = spec.paths !== undefined && spec.paths !== null;
    const hasComponents = !!spec.components;
    const hasWebhooks = !!spec.webhooks;

    if (isOpenApi3) {
        if (!hasPaths && !hasComponents && !hasWebhooks) {
            throw new SpecValidationError("OpenAPI 3.x specification must contain at least one of: 'paths', 'components', or 'webhooks'.");
        }

        // 6. Check Component Key Constraints (OAS 3.x)
        // "All the fixed fields declared above are objects that MUST use keys that match the regular expression: ^[a-zA-Z0-9\.\-_]+$."
        if (spec.components) {
            const componentTypes = [
                'schemas', 'responses', 'parameters', 'examples', 'requestBodies',
                'headers', 'securitySchemes', 'links', 'callbacks', 'pathItems'
            ];
            const validKeyRegex = /^[a-zA-Z0-9\.\-_]+$/;

            for (const type of componentTypes) {
                const componentGroup = (spec.components as any)[type];
                if (componentGroup) {
                    for (const key of Object.keys(componentGroup)) {
                        if (!validKeyRegex.test(key)) {
                            throw new SpecValidationError(`Invalid component key "${key}" in "components.${type}". Keys must match regex: ^[a-zA-Z0-9\\.\\-_]+$`);
                        }
                    }
                }
            }
        }
    } else {
        // Swagger 2.0 strictness
        if (!hasPaths) {
            throw new SpecValidationError("Swagger 2.0 specification must contain a 'paths' object.");
        }
    }
}
