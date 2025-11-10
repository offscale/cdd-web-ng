import { SwaggerParser } from '../../../core/parser.js';
import { SwaggerDefinition } from '../../../core/types.js';

export class MockDataGenerator {
    constructor(private parser: SwaggerParser) {}

    public generate(schemaName: string): string {
        const schemaDef = this.parser.schemas.find(s => s.name === schemaName)?.definition;
        if (!schemaDef) return '{}';
        const value = this.generateValue(schemaDef, new Set<SwaggerDefinition>());
        return typeof value === 'undefined' ? '{}' : JSON.stringify(value, null, 2);
    }

    private generateValue(schema: SwaggerDefinition | undefined, visited: Set<SwaggerDefinition>): any {
        if (!schema) return undefined;
        if (schema.$ref) {
            const resolved = this.parser.resolve<SwaggerDefinition>(schema);
            return this.generateValue(resolved, visited);
        }
        if (visited.has(schema)) return {};

        if ('example' in schema && schema.example !== undefined) return schema.example;

        visited.add(schema);
        try {
            if (schema.allOf) {
                let mergedObj: any = {};
                let mergedObjHasKeys = false;
                let lastPrimitiveValue: any = undefined;
                for (const sub of schema.allOf) {
                    const val = this.generateValue(sub, visited);
                    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                        Object.assign(mergedObj, val);
                        mergedObjHasKeys = mergedObjHasKeys || Object.keys(val).length > 0;
                    } else if (typeof val !== 'undefined') {
                        lastPrimitiveValue = val;
                    }
                }
                if (mergedObjHasKeys) return mergedObj;
                if (typeof lastPrimitiveValue !== 'undefined') return lastPrimitiveValue;
                return undefined;
            }

            let type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
            if (!type && schema.properties) type = 'object';

            switch (type) {
                case 'object': {
                    if (!schema.properties) return {};
                    const obj: any = {};
                    for (const [k, v] of Object.entries(schema.properties)) {
                        if (v && !v.readOnly) {
                            const propValue = this.generateValue(v, visited);
                            if (typeof propValue !== 'undefined') obj[k] = propValue;
                        }
                    }
                    return obj;
                }
                case 'array': {
                    if (schema.items && !Array.isArray(schema.items)) {
                        const val = this.generateValue(schema.items as SwaggerDefinition, visited);
                        return typeof val === 'undefined' ? [] : [val];
                    }
                    return [];
                }
                case 'string':
                    if (schema.format === 'date-time' || schema.format === 'date') return new Date().toISOString();
                    if (schema.format === 'email') return "test@example.com";
                    if (schema.format === 'uuid') return "123e4567-e89b-12d3-a456-426614174000";
                    return 'string-value';
                case 'number':
                case 'integer':
                    if (typeof schema.minimum !== 'undefined') return schema.minimum;
                    if (typeof schema.default !== 'undefined') return schema.default;
                    return 123;
                case 'boolean':
                    if (typeof schema.default !== 'undefined') return schema.default;
                    return true;
                case 'null':
                    return null;
                default:
                    return undefined;
            }
        } finally {
            visited.delete(schema);
        }
    }
}
