import { Project } from 'ts-morph';
import * as fs from 'fs';
import * as path from 'path';

const project = new Project({ tsConfigFilePath: './tsconfig.json' });

const targetDirs = [
    'src/functions',
    'src/classes',
    'src/docstrings',
    'src/routes',
    'src/tests',
    'src/mocks',
    'src/openapi',
];

function mergeFiles(dir: string, prefix: string, targetName: string) {
    const files = project.getSourceFiles(path.join(dir, `${prefix}_*.ts`));
    if (files.length === 0) return;

    let targetFile = project.getSourceFile(path.join(dir, targetName));
    if (!targetFile) {
        targetFile = project.createSourceFile(path.join(dir, targetName), '', { overwrite: true });
    } else {
        // remove export {}
        targetFile.getStatements().forEach(stmt => {
            if (stmt.getText().includes('export {}') || stmt.getText().includes('TODO: implement')) {
                stmt.remove();
            }
        });
    }

    const importsMap = new Map<string, Set<string>>();

    for (const file of files) {
        for (const importDecl of file.getImportDeclarations()) {
            const moduleSpecifier = importDecl.getModuleSpecifierValue();
            if (moduleSpecifier.startsWith('.')) {
                // Keep relative imports as is for now, but we need to resolve them later if they point to moved files
                // Wait, if we move everything into emit.ts, relative imports to other emit_*.ts should be removed
                // or updated. We will do a project-wide fix of imports after merging.
            }
            const namedImports = importDecl.getNamedImports().map(n => n.getName());
            if (!importsMap.has(moduleSpecifier)) importsMap.set(moduleSpecifier, new Set());
            const set = importsMap.get(moduleSpecifier)!;
            namedImports.forEach(n => set.add(n));
        }

        // Move all non-import statements to targetFile
        const stmts = file.getStatements().filter(s => s.getKindName() !== 'ImportDeclaration');
        targetFile.addStatements(stmts.map(s => s.getText()));

        file.delete(); // Delete original file
    }

    // Add imports
    for (const [moduleSpecifier, namedImports] of importsMap.entries()) {
        targetFile.addImportDeclaration({
            moduleSpecifier,
            namedImports: Array.from(namedImports),
        });
    }
}

targetDirs.forEach(dir => {
    mergeFiles(dir, 'emit', 'emit.ts');
    mergeFiles(dir, 'parse', 'parse.ts');
});

project.saveSync();
