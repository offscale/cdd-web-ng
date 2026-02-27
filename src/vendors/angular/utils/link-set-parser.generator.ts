import * as path from 'node:path';
import { Project, Scope } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';

export class LinkSetParserGenerator {
    constructor(private project: Project) {}

    public generate(outputDir: string): void {
        const utilsDir = path.join(outputDir, 'utils');
        const filePath = path.join(utilsDir, 'linkset-parser.ts');

        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        sourceFile.addInterface({
            name: 'LinkSetContext',
            isExported: true,
            properties: [
                { name: 'href', type: 'string' },
                {
                    name: 'attributes',
                    type: 'Record<string, string | boolean>',
                    hasQuestionToken: true,
                },
            ],
            docs: ['Represents a single link within a LinkSet.'],
        });

        const classDeclaration = sourceFile.addClass({
            name: 'LinkSetParser',
            isExported: true,
            docs: ['Utility to parse RFC 9264 LinkSets (HTTP Link Header or application/linkset content).'],
        });

        classDeclaration.addMethod({
            name: 'parseHeader',
            isStatic: true,
            scope: Scope.Public,
            parameters: [{ name: 'headerValue', type: 'string | null' }],
            returnType: 'LinkSetContext[]',
            docs: ['Parses an HTTP Link header value into structured link objects.'],
            statements: `
        if (!headerValue) return [];

        const links: LinkSetContext[] = [];
        const parts = headerValue.split(',').map(p => p.trim()).filter(p => p.length > 0);

        for (const part of parts) {
            // Simple split by semicolon. Note: quoted attributes might contain semicolons,
            // a robust production parser would need a state machine, but this covers standard use cases.
            const section = part.split(';');
            if (section.length === 0) continue;

            const urlPart = section[0].trim();
            if (!urlPart.startsWith('<') || !urlPart.endsWith('>')) continue;

            const href = urlPart.substring(1, urlPart.length - 1);
            const attributes: Record<string, string | boolean> = {};

            for (let i = 1; i < section.length; i++) {
                const attr = section[i].trim();
                const equalsIndex = attr.indexOf('=');
                if (equalsIndex > -1) {
                    const key = attr.substring(0, equalsIndex).trim().toLowerCase();
                    let val = attr.substring(equalsIndex + 1).trim();
                    if (val.startsWith('"') && val.endsWith('"')) {
                        val = val.substring(1, val.length - 1);
                    }
                    attributes[key] = val;
                } else {
                    // RFC 5988/8288 implies attributes usually have values, but boolean flags might exist in custom parsers
                    if (attr.length > 0) attributes[attr.toLowerCase()] = true;
                }
            }

            links.push({ href, attributes });
        }

        return links;`,
        });

        classDeclaration.addMethod({
            name: 'parseJson',
            isStatic: true,
            scope: Scope.Public,
            parameters: [{ name: 'json', type: 'any' }],
            returnType: 'LinkSetContext[]',
            docs: ['Parses application/linkset+json content.'],
            statements: `
        if (!json || typeof json !== 'object') return [];
        if (Array.isArray(json)) {
            // If raw array, map directly (RFC 9264 Section 4.2 JSON representation is an array of link objects)
            return json.map(item => ({
                href: item.href,
                attributes: { ...item, href: undefined } // Everything else treated as attribute
            })).filter(l => !!l.href);
        }
        // If it's an object (link set), it might be keyed by relation (not standard linkset+json but common in HAL/others, handled defensively)
        if (json.linkset && Array.isArray(json.linkset)) {
            return this.parseJson(json.linkset);
        }
        return [];`,
        });

        sourceFile.formatText();
    }
}
