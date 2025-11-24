import { SwaggerDefinition } from "../../../core/types.js";

export class MockDataGenerator {
    public generate(schema: SwaggerDefinition, examples?: Record<string, any>): any {
        if (!schema) return {};

        // 1. Check external examples map (explicit override)
        if (examples) {
            // If schema has a title, look it up
            if (schema.title && examples[schema.title]) {
                return examples[schema.title].value;
            }
            // Fallback
            const keys = Object.keys(examples);
            if (keys.length > 0 && examples[keys[0]].value) {
                return examples[keys[0]].value;
            }
        }

        // 1b. Explicit Example in Schema
        if (schema.example !== undefined) return schema.example;
        if (schema.default !== undefined) return schema.default;

        // 2. Enum
        if (schema.enum && schema.enum.length > 0) {
            return schema.enum[0];
        }

        // 3. Primitive Types
        switch (schema.type) {
            case 'string':
                if (schema.format === 'date' || schema.format === 'date-time') return new Date().toISOString();
                if (schema.format === 'email') return 'user@example.com';
                if (schema.format === 'uuid') return '00000000-0000-0000-0000-000000000000';
                return 'string_value';
            case 'number':
            case 'integer':
                return 0;
            case 'boolean':
                return true;
            case 'array':
                if (Array.isArray(schema.items)) return [];
                return [];
            case 'object':
                if (schema.properties) {
                    const obj: Record<string, any> = {};
                    for (const [key, prop] of Object.entries(schema.properties)) {
                        if (prop.$ref === schema.$ref && schema.$ref) continue;
                        obj[key] = this.generate(prop, examples);
                    }
                    return obj;
                }
                return {};
        }

        return {};
    }
}
