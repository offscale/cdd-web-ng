import { Project } from 'ts-morph';
import { posix as path } from 'path';
import customValidatorsTemplate from '../../templates/custom-validators.ts.template';

export class CustomValidatorsGenerator {
    constructor(private project: Project) { }

    public generate(adminDir: string): void {
        const sharedDir = path.join(adminDir, 'shared');
        this.project.getFileSystem().mkdirSync(sharedDir, { recursive: true });
        const filePath = path.join(sharedDir, 'custom-validators.ts');

        this.project.createSourceFile(filePath, customValidatorsTemplate, { overwrite: true });
    }
}
