import os

def r(f, old, new):
    if not os.path.exists(f): return
    with open(f, 'r') as file:
        c = file.read()
    c = c.replace(old, new)
    with open(f, 'w') as file:
        file.write(c)

type_str = "string | number | boolean | object | undefined | null"
record_str = f"Record<string, {type_str}>"

p = 'tests/70-generated-code/00-service-test-gen.spec.ts'
r(p, "const foo: string = 'foo';", "const foo = 'foo' as string;")
r(p, "const id: number = 0;", "const id = 0 as number;")
r(p, f"const options: {record_str} = {{}};", f"const options = {{}} as {record_str};")
r(p, "const param: boolean = false;", "const param = false as boolean;")

p = 'tests/30-emit-service/01-service-method-body.spec.ts'
reqOpt = "{ headers?: HttpHeaders; observe: 'response'; context?: HttpContext; reportProgress?: boolean; responseType?: 'json'; withCredentials?: boolean }"
r(p, f"requestOptions as {record_str}", f"requestOptions as {reqOpt}")
r(p, f"requestOptions as {type_str}", f"requestOptions as {reqOpt}")

p = 'tests/30-emit-service/03-service-method-edge-cases.spec.ts'
r(p, f"requestOptions as {record_str}", f"requestOptions as {reqOpt}")
r(p, f"requestOptions as {type_str}", f"requestOptions as {reqOpt}")

p = 'tests/30-emit-service/00-service-generator.spec.ts'
r(p, f"requestOptions as {record_str}", f"requestOptions as {reqOpt}")
r(p, f"requestOptions as {type_str}", f"requestOptions as {reqOpt}")

p = 'tests/30-emit-service/02-coverage.spec.ts'
r(p, f"requestOptions as {record_str}", f"requestOptions as {reqOpt}")
r(p, f"requestOptions as {type_str}", f"requestOptions as {reqOpt}")

p = 'tests/30-emit-service/04-service-method-generator-coverage.spec.ts'
r(p, f"requestOptions as {record_str}", f"requestOptions as {reqOpt}")
r(p, f"requestOptions as {type_str}", f"requestOptions as {reqOpt}")

