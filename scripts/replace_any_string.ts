import fs from 'node:fs';
import path from 'node:path';

function walkDir(dir: string, callback: (filepath: string) => void) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory) {
            walkDir(dirPath, callback);
        } else {
            callback(dirPath);
        }
    });
}

walkDir('./src', (filepath) => {
    if (filepath.endsWith('.ts') && !filepath.includes('/tests/')) {
        let content = fs.readFileSync(filepath, 'utf8');
        // We only want to replace standalone "any", but only where it makes sense as a type string.
        // It's safer to just do a smart regex replacement or manual. Let's do a basic regex.
        let newContent = content.replace(/'any'/g, "'unknown'")
            .replace(/: 'any'/g, ": 'unknown'")
            .replace(/<any>/g, "<unknown>")
            .replace(/any\[\]/g, "unknown[]")
            .replace(/as any\)/g, "as unknown)")
            .replace(/as any\]/g, "as unknown]")
            .replace(/:\s*any\s*=/g, ": unknown =")
            .replace(/type: 'any'/g, "type: 'unknown'")
            .replace(/returnType: 'any'/g, "returnType: 'unknown'");
        
        if (content !== newContent) {
            fs.writeFileSync(filepath, newContent);
            console.log(`Replaced in ${filepath}`);
        }
    }
});
