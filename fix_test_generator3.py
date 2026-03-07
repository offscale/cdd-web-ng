import os

p = 'src/vendors/angular/test/service-test-generator.ts'
with open(p, 'r') as f:
    c = f.read()

type_str = "string | number | boolean | object | undefined | null"

# Fix bodyParam
c = c.replace(f"as ${{bodyParam.type}};", f"as {type_str} as ${{bodyParam.type}};")

# Fix method parameters in mockValues map
c = c.replace(
    f"const ${{method.parameters[i].name}} = ${{v}} as ${{method.parameters[i].type}};",
    f"const ${{method.parameters[i].name}} = ${{v}} as {type_str} as ${{method.parameters[i].type}};"
)

# Fix other params
c = c.replace(f"as ${{p.type}};", f"as {type_str} as ${{p.type}};")

with open(p, 'w') as f:
    f.write(c)

