import os

p = 'src/vendors/angular/test/service-test-generator.ts'
with open(p, 'r') as f:
    c = f.read()

c = c.replace("as ${bodyParam.model || 'string | number | boolean | object | undefined | null'}; // @ts-ignore", "as ${bodyParam.type}; // @ts-ignore")

with open(p, 'w') as f:
    f.write(c)

