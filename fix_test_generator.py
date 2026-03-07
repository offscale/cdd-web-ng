import os

p = 'src/vendors/angular/test/service-test-generator.ts'
with open(p, 'r') as f:
    c = f.read()

type_str = "string | number | boolean | object | undefined | null"

# Fix bodyParam
c = c.replace(
    f"const ${{bodyParam.name}} = ${{mockData.replace(/\"new Date\(\)\"/g, 'new Date()')}} as ${{bodyParam.model || '{type_str}'}};", 
    f"const ${{bodyParam.name}} = ${{mockData.replace(/\"new Date\(\)\"/g, 'new Date()')}} as {type_str} as ${{bodyParam.model || '{type_str}'}};"
)
c = c.replace(f"const ${{bodyParam.name}} = 'test-body' as ${{bodyParam.model || '{type_str}'}};", f"const ${{bodyParam.name}} = 'test-body' as {type_str} as ${{bodyParam.model || '{type_str}'}};")
c = c.replace(f"const ${{bodyParam.name}} = {{ data: 'test-body' }} as ${{bodyParam.model || '{type_str}'}};", f"const ${{bodyParam.name}} = {{ data: 'test-body' }} as {type_str} as ${{bodyParam.model || '{type_str}'}};")

# Fix other params
c = c.replace(f"const ${{p.name}} = ${{p.value}} as ${{p.type}};", f"const ${{p.name}} = ${{p.value}} as {type_str} as ${{p.type}};")

# Also for `const status = ['available'] as ...`
# Wait, I didn't generate arrays for single values! But as string | number ... as enum will suppress it.

with open(p, 'w') as f:
    f.write(c)

