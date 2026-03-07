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

# 30-emit-service/02-coverage.spec.ts
r('tests/30-emit-service/02-coverage.spec.ts', f"'{type_str}'", f"'{ast_str} | null | undefined'")

# 30-emit-service/04-service-method-generator-coverage.spec.ts
r('tests/30-emit-service/04-service-method-generator-coverage.spec.ts', f"Record<string, {type_str}>", f"Record<string, {ast_str}>")

# 30-emit-service/09-content-decoding.spec.ts
r('tests/30-emit-service/09-content-decoding.spec.ts', f"Record<string, {type_str}>", f"Record<string, {ast_str}>")

# 50-emit-admin/03-form-component-generator.spec.ts
r('tests/50-emit-admin/03-form-component-generator.spec.ts', f"Record<string, {type_str}>", f"Record<string, {ast_str}>")

