import os

reqOpt = "{ headers?: HttpHeaders; observe: 'response' | 'body' | 'events'; context?: HttpContext; reportProgress?: boolean; responseType?: 'json'; withCredentials?: boolean }"

for root, _, files in os.walk('tests'):
    for file in files:
        if file.endswith('.ts'):
            p = os.path.join(root, file)
            with open(p, 'r') as f:
                c = f.read()
            if f"requestOptions as {reqOpt}" in c:
                c = c.replace(f"requestOptions as {reqOpt}", "requestOptions as object")
                with open(p, 'w') as f:
                    f.write(c)

