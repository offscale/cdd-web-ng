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

for root, _, files in os.walk('tests'):
    for file in files:
        if file.endswith('.spec.ts'):
            path = os.path.join(root, file)
            r(path, "Record<string, never>", f"Record<string, {type_str}>")
            
# specific AST string fixes
r('tests/50-emit-admin/03-form-component-generator.spec.ts', f"toBe('Record<string, {type_str}>')", f"toBe('Record<string, {ast_str}>')")

