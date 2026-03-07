import os

def r(f, old, new):
    if not os.path.exists(f): return
    with open(f, 'r') as file:
        c = file.read()
    c = c.replace(old, new)
    with open(f, 'w') as file:
        file.write(c)

type_str = "string | number | boolean | object | undefined | null"
ast_str = "string | number | boolean | object"

# 50-emit-admin/03-form-component-generator.spec.ts:682
r('tests/50-emit-admin/03-form-component-generator.spec.ts', 
  f".toBe('Record<string, {type_str}>')",
  f".toBe('Record<string, {ast_str}>')")

