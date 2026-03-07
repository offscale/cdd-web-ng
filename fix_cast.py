import os
import re

p = 'src/vendors/angular/service/service-method.generator.ts'
with open(p, 'r') as f:
    c = f.read()

reqOpt = "{ headers?: HttpHeaders; observe: 'response' | 'body' | 'events'; context?: HttpContext; reportProgress?: boolean; responseType?: 'json'; withCredentials?: boolean }"

c = c.replace(f"requestOptions as {reqOpt}", "requestOptions as object")

with open(p, 'w') as f:
    f.write(c)

