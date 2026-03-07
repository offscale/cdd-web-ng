import os

p = 'src/vendors/angular/test/service-test-generator.ts'
with open(p, 'r') as f:
    c = f.read()

type_str = "string | number | boolean | object | undefined | null"

c = c.replace(
    f"const ${{bodyParam.name}} = ${{mockData.replace(/\"new Date\(\)\"/g, 'new Date()')}} as string | number | boolean | Record<string, {type_str}> | null;",
    f"const ${{bodyParam.name}} = ${{mockData.replace(/\"new Date\(\)\"/g, 'new Date()')}} as ${{bodyParam.type}};"
)
c = c.replace(
    f"const ${{bodyParam.name}} = 'test-body' as string | number | boolean | Record<string, {type_str}> | null;",
    f"const ${{bodyParam.name}} = 'test-body' as ${{bodyParam.type}};"
)
c = c.replace(
    f"const ${{bodyParam.name}} = {{ data: 'test-body' }} as string | number | boolean | Record<string, {type_str}> | null;",
    f"const ${{bodyParam.name}} = {{ data: 'test-body' }} as ${{bodyParam.type}};"
)

with open(p, 'w') as f:
    f.write(c)

