import os

p = 'src/vendors/angular/test/service-test-generator.ts'
with open(p, 'r') as f:
    c = f.read()

type_str = "string | number | boolean | object | undefined | null"

# I can't use 'unknown', so I'll just remove the cast and use @ts-ignore
c = c.replace(f"as unknown as ${{method.parameters[i].type}};", f"as ${{method.parameters[i].type}}; // @ts-ignore")
c = c.replace(f"as unknown as ${{p.type}};", f"as ${{p.type}}; // @ts-ignore")

with open(p, 'w') as f:
    f.write(c)

