import os
import re

def r(f, old, new):
    if not os.path.exists(f): return
    with open(f, 'r') as file:
        c = file.read()
    c = c.replace(old, new)
    with open(f, 'w') as file:
        file.write(c)

type_str = "string | number | boolean | object | undefined | null"
record_str = f"Record<string, {type_str}>"

p = 'src/vendors/angular/test/service-test-generator.ts'
r(p, "mockValues.map((v, i) => `            const ${method.parameters[i].name}: ${method.parameters[i].type} = ${v};`).join('\\n')",
     "mockValues.map((v, i) => `            const ${method.parameters[i].name} = ${v} as ${method.parameters[i].type};`).join('\\n')")

# parameter-serializer.ts & http-params-builder.ts need proper Config typing
p = 'src/vendors/angular/utils/parameter-serializer.generator.ts'
r(p, f"config: {record_str}", f"config: {record_str}")

p = 'src/vendors/angular/service/service-method.generator.ts'
r(p, f"requestOptions as Blob | string | {type_str}", "requestOptions as { headers?: HttpHeaders; observe: 'response'; context?: HttpContext; reportProgress?: boolean; responseType?: 'json'; withCredentials?: boolean }")
r(p, f"requestOptions as {type_str}", "requestOptions as { headers?: HttpHeaders; observe: 'response'; context?: HttpContext; reportProgress?: boolean; responseType?: 'json'; withCredentials?: boolean }")

