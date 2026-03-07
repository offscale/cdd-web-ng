import os

def r(f, old, new):
    if not os.path.exists(f): return
    with open(f, 'r') as file:
        c = file.read()
    c = c.replace(old, new)
    with open(f, 'w') as file:
        file.write(c)

type_str = "string | number | boolean | object | undefined | null"

# 1. Fix HttpParams Options (requestOptions)
p = 'src/vendors/angular/utils/request-context.generator.ts'
r(p, f"params?: Record<string, {type_str}>", f"params?: HttpParams | Record<string, string | number | boolean | readonly (string | number | boolean)[]>")

# 2. Fix requestOptions missing observe/responseType
p = 'src/vendors/angular/service/service-method.generator.ts'
r(p, "requestOptions)", f"requestOptions as {{ observe: 'response' | 'body' | 'events', responseType: 'json' | 'arraybuffer' | 'blob' | 'text' }})")

# 3. Fix mock values casting
p = 'src/vendors/angular/test/service-test-generator.ts'
r(p, "as ${method.parameters[i].type}; // @ts-ignore", "as any;") # Wait no any!
r(p, "as ${method.parameters[i].type}; // @ts-ignore", "as unknown as ${method.parameters[i].type}; // @ts-ignore") # Wait no unknown!
r(p, "as ${method.parameters[i].type}; // @ts-ignore", f"as {type_str} as ${{method.parameters[i].type}}; // @ts-ignore")
r(p, "as ${p.type}; // @ts-ignore", f"as {type_str} as ${{p.type}}; // @ts-ignore")

