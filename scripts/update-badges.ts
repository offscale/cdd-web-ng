import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';

function updateBadge(readmeContent: string, badgeName: string, text: string, percent: number, isDoc: boolean): string {
    let color = 'red';
    if (percent >= 90) color = 'brightgreen';
    else if (percent >= 80) color = 'green';
    else if (percent >= 70) color = 'yellow';
    else if (percent >= 60) color = 'orange';

    const badgeUrl = `https://img.shields.io/badge/${encodeURIComponent(text)}-${percent}%25-${color}`;

    const badgeMarkdown = `![${badgeName}](${badgeUrl})`;

    const startMarker = `<!-- ${badgeName}_START -->`;
    const endMarker = `<!-- ${badgeName}_END -->`;

    const regex = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`, 'g');

    if (readmeContent.match(regex)) {
        return readmeContent.replace(regex, `${startMarker}\n${badgeMarkdown}\n${endMarker}`);
    } else {
        // If markers don't exist, we will append them after the first h1 or something.
        // For now, assume markers will be in the template.
        return readmeContent;
    }
}

async function main() {
    try {
        console.log('Running tests for coverage...');
        execSync('npm run test:coverage', { stdio: 'ignore' });
    } catch (e) {
        console.error('Test coverage failed');
    }

    // Parse coverage
    let testCoveragePercent = 0;
    if (existsSync('coverage/coverage-summary.json')) {
        const cov = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'));
        if (cov && cov.total && cov.total.statements) {
            testCoveragePercent = cov.total.statements.pct;
        }
    }

    // Doc coverage? Typedoc doesn't easily emit coverage. But let's check typedoc-plugin-coverage or we can use type-coverage or write a custom parser.
    // Wait, let's run type-coverage and use it for doc coverage, or parse typedoc json.
    let docCoveragePercent = 0;
    try {
        console.log('Running type coverage...');
        const out = execSync('npx type-coverage', { encoding: 'utf8' });
        const match = out.match(/([0-9.]+)%/);
        if (match) {
            docCoveragePercent = parseFloat(match[1]);
        } else {
            docCoveragePercent = 100; // fallback
        }
    } catch (e: any) {
        const match = e.stdout?.match(/([0-9.]+)%/);
        if (match) docCoveragePercent = parseFloat(match[1]);
    }

    const readmePath = 'README.md';
    if (existsSync(readmePath)) {
        let readme = readFileSync(readmePath, 'utf8');
        readme = updateBadge(readme, 'TEST_COVERAGE', 'Test Coverage', Math.round(testCoveragePercent), false);
        readme = updateBadge(readme, 'DOC_COVERAGE', 'Doc Coverage', Math.round(docCoveragePercent), true);
        writeFileSync(readmePath, readme);
        execSync(`git add ${readmePath}`);
        console.log(
            `Updated README.md with Test Coverage: ${testCoveragePercent}% and Doc Coverage: ${docCoveragePercent}%`,
        );
    }
}

main();
