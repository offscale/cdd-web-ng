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
ast_str2 = "string | number | boolean | object | null | undefined"

# 30-emit-service/02-coverage.spec.ts
r('tests/30-emit-service/02-coverage.spec.ts', f"Observable<Record<string, {type_str}>>", f"Observable<{ast_str2}>")

# 30-emit-service/04-service-method-generator-coverage.spec.ts
r('tests/30-emit-service/04-service-method-generator-coverage.spec.ts', f"Record<string, {ast_str}>", f"{type_str}")
r('tests/30-emit-service/04-service-method-generator-coverage.spec.ts', f"Record<string, {type_str}>", f"{type_str}")

# 30-emit-service/09-content-decoding.spec.ts
r('tests/30-emit-service/09-content-decoding.spec.ts', f"Record<string, {ast_str}>", f"{type_str}")
r('tests/30-emit-service/09-content-decoding.spec.ts', f"Record<string, {type_str}>", f"{type_str}")

