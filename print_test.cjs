const { execSync } = require('child_process');
const fs = require('fs');

const file = 'src/functions/parse_analyzer.ts';
let code = fs.readFileSync(file, 'utf8');
code = code.replace('const bodyParamName = bodyParamDef.name!;', 'console.log("BODY PARAM DEF:", bodyParamDef); const bodyParamName = bodyParamDef.name!;');
fs.writeFileSync(file, code);

try {
  const result = execSync('npx vitest run tests/30-emit-service/01-service-method-body.spec.ts', { encoding: 'utf-8' });
  console.log(result);
} catch (e) {
  console.log(e.stdout);
}

execSync('git checkout src/functions/parse_analyzer.ts');
