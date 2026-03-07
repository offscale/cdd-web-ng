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
reqOpt = "{ headers?: HttpHeaders; observe: 'response'; context?: HttpContext; reportProgress?: boolean; responseType?: 'json'; withCredentials?: boolean }"

p = 'src/vendors/angular/service/service-method.generator.ts'
r(p, f"requestOptions as {record_str}", f"requestOptions as {reqOpt}")

