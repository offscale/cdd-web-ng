import { describe, it, expect } from 'vitest';
import { parseGeneratedCliSource } from '../../src/vendors/cli/parse.js';

describe('parseGeneratedCliSource', () => {
    it('should parse a generated CLI file back into an OpenAPI spec', () => {
        const sourceText = `
import { Command, Option } from "commander";
import * as services from "./services/index.js";

const program = new Command();
program.name('api-cli').description('Test CLI').version('2.0.0');
program.addHelpText('after', 'Extra docs');
program.option('--server <url>', 'Override base server URL', 'http://localhost');
program.option('--auth-bearer <token>', 'Bearer token');

const usersCommand = program.command('users').description('Commands for users');
usersCommand.command('getUser')
    .description('Get User by ID')
    .option('--id <value>', 'User ID')
    .option('--format [value]', 'Output format')
    .action(async (options) => {
        console.log("ok");
    });
`;
        const spec = parseGeneratedCliSource(sourceText);

        expect(spec.info?.title).toBe('api-cli');
        expect(spec.info?.version).toBe('2.0.0');
        expect(spec.info?.description).toBe('Test CLI');

        expect(spec.servers).toBeDefined();
        expect(spec.servers![0].url).toBe('http://localhost');

        expect(spec.paths).toBeDefined();
        const getUserOp = spec.paths!['/users/getUser'].post!;
        expect(getUserOp).toBeDefined();
        expect(getUserOp.operationId).toBe('getUser');
        expect(getUserOp.tags).toEqual(['Users']);
        expect(getUserOp.description).toBe('Get User by ID');

        expect(getUserOp.parameters).toBeDefined();
        const parameters = getUserOp.parameters as import('../../src/core/types/openapi.js').Parameter[];
        expect(parameters.length).toBe(2);

        expect(parameters[0].name).toBe('id');
        expect(parameters[0].required).toBe(true);
        expect(parameters[0].description).toBe('User ID');

        expect(parameters[1].name).toBe('format');
        expect(parameters[1].required).toBe(false);
    });

    it('should handle an empty file gracefully', () => {
        const spec = parseGeneratedCliSource('');
        expect(spec.info?.title).toBe('api-cli');
        expect(Object.keys(spec.paths!).length).toBe(0);
    });

    it('should fall back for missing chained operations', () => {
        const sourceText = `
import { Command } from "commander";
const program = new Command();
program.name('api-cli');
// Using a simple call that doesn't trigger property accesses
program();
`;
        const spec = parseGeneratedCliSource(sourceText);
        expect(spec.info?.title).toBe('api-cli');
    });
});
