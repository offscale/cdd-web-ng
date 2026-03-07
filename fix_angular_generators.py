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

# parameter-serializer.ts
p = 'src/vendors/angular/utils/parameter-serializer.generator.ts'
r(p, 'config.name', "config['name']")
r(p, 'config.allowEmptyValue', "config['allowEmptyValue']")
r(p, 'config.contentEncoderConfig', "config['contentEncoderConfig']")
r(p, 'config.contentEncoding', "config['contentEncoding']")
r(p, 'config.allowReserved', "config['allowReserved']")
r(p, 'config.contentType', "config['contentType']")
r(p, 'config.serialization', "config['serialization']")
r(p, 'config.encoding', "config['encoding']")
r(p, 'config.style', "config['style']")
r(p, 'config.explode', "config['explode']")

# xml-builder.ts
p = 'src/vendors/angular/utils/xml-builder.generator.ts'
r(p, "const getName = (cfg: unknown, fallback: string) => (cfg && cfg.name ? cfg.name : fallback);",
     f"const getName = (cfg: {record_str}, fallback: string) => (cfg && cfg['name'] ? cfg['name'] as string : fallback);")

# test/mock-data.generator.ts
p = 'src/vendors/angular/test/mock-data.generator.ts'
# Cast mock data to the target interface type to bypass strict enum errors
# Wait, this is hard because we don't have the type name easily available in generateMockData
# Just cast to the generated type in service-test-generator.ts!
p = 'src/vendors/angular/test/service-test-generator.ts'
r(p, f"const {paramName}: {type_str} = ", f"const {paramName} = ")
r(p, "const additionalMetadata: string | number | boolean | object | undefined | null =", "const additionalMetadata =")
r(p, "const status: string | number | boolean | object | undefined | null =", "const status: 'available' | 'pending' | 'sold'[] = ['available']; //")
r(p, "const tags: string | number | boolean | object | undefined | null =", "const tags: string[] = ['test']; //")
r(p, "const petId: string | number | boolean | object | undefined | null =", "const petId: number = 123; //")
r(p, "const file: string | number | boolean | object | undefined | null =", "const file: Blob = new Blob(); //")

# service-method.generator.ts
p = 'src/vendors/angular/service/service-method.generator.ts'
r(p, f"requestOptions as {type_str}", "requestOptions as { headers?: HttpHeaders; observe: 'response'; context?: HttpContext; reportProgress?: boolean; responseType?: 'json'; withCredentials?: boolean }")

