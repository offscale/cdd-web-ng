const { execSync } = require('child_process');
try {
  const result = execSync('npx vitest run tests/30-emit-service/01-service-method-body.spec.ts', { encoding: 'utf-8' });
  console.log(result);
} catch (e) {
  console.log(e.stdout);
}
