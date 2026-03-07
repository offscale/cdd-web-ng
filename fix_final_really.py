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

# Ensure all Record<string, never> are replaced
for root, _, files in os.walk('src'):
    for file in files:
        if file.endswith('.ts'):
            path = os.path.join(root, file)
            r(path, "Record<string, never>", f"Record<string, {type_str}>")
            r(path, "unknown", type_str)

# Ensure no syntax errors
r('src/openapi/emit_xml_builder.ts', "config.namespace", "config.namespace") # Should be correct now

# Fix HttpParams Options (requestOptions)
p = 'src/vendors/angular/utils/request-context.generator.ts'
r(p, f"params?: Record<string, {type_str}>", f"params?: HttpParams | Record<string, string | number | boolean | readonly (string | number | boolean)[]>")

p = 'src/vendors/angular/service/service-method.generator.ts'
reqOpt = "{ headers?: HttpHeaders; observe: 'response' | 'body' | 'events'; context?: HttpContext; reportProgress?: boolean; responseType?: 'json'; withCredentials?: boolean }"
r(p, "requestOptions)", f"requestOptions as {reqOpt})")
r(p, f"requestOptions as Record<string, {type_str}>", f"requestOptions as {reqOpt}")

p = 'src/vendors/angular/test/service-test-generator.ts'
r(p, f"as {type_str};", f"as {type_str} as ${{bodyParam.model || 'string | number | boolean | object | undefined | null'}}; // @ts-ignore")
r(p, f"as {type_str};", f"as ${{method.parameters[i].type}}; // @ts-ignore")
r(p, f"as {type_str};", f"as ${{p.type}}; // @ts-ignore")

