import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { CliGenerator } from '../../src/vendors/cli/emit.js';

describe('CliGenerator', () => {
    it('should generate cli.ts with correct imports and commands', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const generator = new CliGenerator();

        const mockParser = {
            spec: {
                openapi: '3.1.0',
                info: { title: 'api-cli', version: '1.0.0', description: 'Test CLI' },
                servers: [{ url: 'http://api.example.com' }],
                components: {
                    securitySchemes: {
                        BearerAuth: { type: 'http', scheme: 'bearer' },
                    },
                },
            },
            operations: [
                {
                    tags: ['Users'],
                    operationId: 'getUser',
                    path: '/users/{id}',
                    summary: 'Get User',
                    parameters: [{ name: 'id', in: 'path', required: true }],
                },
                { tags: [{ name: 'Posts' }], path: '/posts', description: 'List Posts' },
                { path: '/no-tag', summary: 'No Tag', requestBody: { content: {} } },
            ],
        } as unknown as import('../../src/openapi/parse.js').SwaggerParser;

        generator.generate(project, mockParser, {} as any, '/out');

        const cliFile = project.getSourceFileOrThrow('/out/cli.ts');
        const text = cliFile.getFullText();

        expect(text).toContain('import { Command, Option } from "commander";');
        expect(text).toContain('import * as services from "./services/index.js";');
        expect(text).toContain("program.name('api-cli')");

        expect(text).toContain("const usersCommand = program.command('users')");
        expect(text).toContain(".description('Get User')");
        expect(text).toContain("const postsCommand = program.command('posts')");
        expect(text).toContain("const defaultCommand = program.command('default')");
        expect(text).toContain(".description('No Tag')");
        expect(text).toContain('const client = new services.UsersService();');
    });
});
