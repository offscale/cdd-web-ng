import * as path from 'node:path';
import { Project, Scope } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../../core/constants.js';

export class ContentEncoderGenerator {
    constructor(private project: Project) {}

    public generate(outputDir: string): void {
        const utilsDir = path.join(outputDir, 'utils');
        const filePath = path.join(utilsDir, 'content-encoder.ts');

        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        sourceFile.addInterface({
            name: 'ContentEncoderConfig',
            isExported: true,
            properties: [
                { name: 'encode', type: 'boolean', hasQuestionToken: true, docs: ['If true, stringify the value.'] },
                { name: 'properties', type: 'Record<string, ContentEncoderConfig>', hasQuestionToken: true },
                { name: 'items', type: 'ContentEncoderConfig', hasQuestionToken: true },
            ],
        });

        const classDeclaration = sourceFile.addClass({
            name: 'ContentEncoder',
            isExported: true,
            docs: [
                'Utility to auto-encode content into strings (e.g. JSON.stringify) based on OAS 3.1 contentMediaType.',
            ],
        });

        classDeclaration.addMethod({
            name: 'encode',
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: 'data', type: 'any' },
                { name: 'config', type: 'ContentEncoderConfig', hasQuestionToken: true },
            ],
            returnType: 'any',
            statements: `
        if (data === null || data === undefined || !config) { 
            return data; 
        } 

        // 1. Auto-encode to string
        if (config.encode && typeof data !== 'string') { 
            try { 
                return JSON.stringify(data);
            } catch (e) { 
                console.warn('Failed to encode content', e); 
                return data; 
            } 
        } 

        // 2. Arrays
        if (Array.isArray(data) && config.items) { 
            return data.map(item => this.encode(item, config.items)); 
        } 

        // 3. Objects
        if (typeof data === 'object') { 
            if (config.properties) { 
                // Shallow copy to avoid mutating original data if used elsewhere
                const result = { ...data }; 
                Object.keys(config.properties).forEach(key => { 
                    if (Object.prototype.hasOwnProperty.call(data, key)) { 
                        result[key] = this.encode(data[key], config.properties![key]); 
                    } 
                }); 
                return result; 
            } 
        } 

        return data;`,
        });

        sourceFile.formatText();
    }
}
