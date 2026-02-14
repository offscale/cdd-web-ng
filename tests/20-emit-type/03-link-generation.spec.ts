import { describe, expect, it } from 'vitest';

import { Project } from 'ts-morph';

import { TypeGenerator } from '@src/generators/shared/type.generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types/index.js';

const linkSpec = {
    openapi: '3.0.0',
    info: { title: 'Link API', version: '1.0' },
    paths: {},
    components: {
        links: {
            UserAddress: {
                operationId: 'getUserAddress',
                parameters: {
                    userId: '$request.path.id',
                },
                description: 'The user address link',
            },
            AnotherLink: {
                operationRef: '#/paths/~12.0~1repositories~1%7Busername%7D/get',
                parameters: {
                    username: '$response.body#/username',
                },
            },
        },
    },
};

describe('Emitter: Link Interface Generation', () => {
    const runGenerator = (spec: any) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = { input: '', output: '/out', options: { enumStyle: 'enum' } };
        const parser = new SwaggerParser(spec, config);
        new TypeGenerator(parser, project, config).generate('/out');
        return project.getSourceFileOrThrow('/out/models/index.ts');
    };

    it('should generate generic interface for named links', () => {
        const sourceFile = runGenerator(linkSpec);

        const userAddressParams = sourceFile.getInterfaceOrThrow('UserAddressLinkParameters');
        expect(userAddressParams).toBeDefined();
        expect(userAddressParams.isExported()).toBe(true);

        const userIdProp = userAddressParams.getPropertyOrThrow('userId');
        // Use getTypeNodeOrThrow().getText() to check strict signature source, prevent 'any' collapse in assertion
        expect(userIdProp.getTypeNodeOrThrow().getText()).toBe('string | any');

        const docs = userAddressParams.getJsDocs()[0];
        // Trim usage to handle potential newlines inserted by ts-morph formatting
        expect(docs.getDescription().trim()).toBe("Parameters for the 'UserAddress' link.");
    });

    it('should handle multiple links', () => {
        const sourceFile = runGenerator(linkSpec);

        const anotherLinkParams = sourceFile.getInterfaceOrThrow('AnotherLinkLinkParameters');
        expect(anotherLinkParams).toBeDefined();
        expect(anotherLinkParams.getPropertyOrThrow('username')).toBeDefined();
    });

    // Swagger 2.0 does not support links, so `parser.links` should be empty, and no interfaces generated.
    it('should not generate anything for Swagger 2.0', () => {
        const spec2 = { swagger: '2.0', info: { title: 'Old API', version: '1.0' }, paths: {} };
        const sourceFile = runGenerator(spec2);

        const interfaces = sourceFile.getInterfaces();
        const linkInterfaces = interfaces.filter(i => i.getName().endsWith('LinkParameters'));
        expect(linkInterfaces.length).toBe(0);
    });
});
