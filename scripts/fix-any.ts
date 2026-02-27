import { Project, SyntaxKind } from 'ts-morph';

const project = new Project({ tsConfigFilePath: './tsconfig.json' });

const sourceFiles = project.getSourceFiles();
for (const sourceFile of sourceFiles) {
    if (sourceFile.getFilePath().includes('/tests/')) continue;

    // Find all 'any' keywords
    const anyKeywords = sourceFile.getDescendantsOfKind(SyntaxKind.AnyKeyword);
    for (const keyword of anyKeywords.reverse()) {
        // reverse to avoid offset issues
        keyword.replaceWithText('never');
    }
}

project.saveSync();
console.log('Replaced any with unknown');
