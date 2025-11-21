// src/core/validator.ts

import { SwaggerSpec } from "./types.js";

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
 * Validates that a parsed object conforms to the basic structure of a Swagger 2.0 or OpenAPI 3.x specification.
 * Checks for:
 * - Valid version string ('swagger: "2.x"' or 'openapi: "3.x"')
 * - "info" object with "title" and "version"
 * - At least one functional root property ("paths", "components", or "webhooks")
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

    // 3. Check Structural Root
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
    } else {
        // Swagger 2.0 strictness
        if (!hasPaths) {
            throw new SpecValidationError("Swagger 2.0 specification must contain a 'paths' object.");
        }
    }
}
