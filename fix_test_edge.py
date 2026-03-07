import os

def r(f, old, new):
    if not os.path.exists(f): return
    with open(f, 'r') as file:
        c = file.read()
    c = c.replace(old, new)
    with open(f, 'w') as file:
        file.write(c)

p = 'tests/30-emit-service/03-service-method-edge-cases.spec.ts'
r(p, '"return this.http.request', '`return this.http.request')
r(p, 'withCredentials?: boolean });",', 'withCredentials?: boolean });`,')

p = 'tests/30-emit-service/04-multipart-defaults.spec.ts'
reqOpt = "{ headers?: HttpHeaders; observe: 'response'; context?: HttpContext; reportProgress?: boolean; responseType?: 'json'; withCredentials?: boolean }"
type_str = "string | number | boolean | object | undefined | null"
record_str = f"Record<string, {type_str}>"
r(p, f"requestOptions as {record_str}", f"requestOptions as {reqOpt}")

