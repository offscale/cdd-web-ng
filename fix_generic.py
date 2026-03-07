import os

p = 'src/vendors/angular/service/service-method.generator.ts'
with open(p, 'r') as f:
    c = f.read()

c = c.replace("const returnGeneric = `Record<string, string | number | boolean | object | undefined | null>`;", "const returnGeneric = `string | number | boolean | object | undefined | null`;")

with open(p, 'w') as f:
    f.write(c)

