import os

def r(f, old, new):
    if not os.path.exists(f): return
    with open(f, 'r') as file:
        c = file.read()
    c = c.replace(old, new)
    with open(f, 'w') as file:
        file.write(c)

type_str = "string | number | boolean | object | undefined | null"

# src/openapi/parse_validator.ts
r('src/openapi/parse_validator.ts', " | 'unknown';", f" | '{type_str}';")

# src/vendors/angular/test/mock-data.generator.ts
r('src/vendors/angular/test/mock-data.generator.ts', 
  "return (schema as Record<string, string | number | boolean | object | undefined | null>).dataValue;",
  "return (schema as Record<string, string | number | boolean | object | undefined | null>).dataValue as string | number | boolean | Record<string, string | number | boolean | object | undefined | null> | null | undefined;")

r('src/vendors/angular/test/mock-data.generator.ts', 
  "return (schema as Record<string, string | number | boolean | object | undefined | null>).value;",
  "return (schema as Record<string, string | number | boolean | object | undefined | null>).value as string | number | boolean | Record<string, string | number | boolean | object | undefined | null> | null | undefined;")

r('src/vendors/angular/test/mock-data.generator.ts', 
  "return (schema as Record<string, string | number | boolean | object | undefined | null>).serializedValue;",
  "return (schema as Record<string, string | number | boolean | object | undefined | null>).serializedValue as string | number | boolean | Record<string, string | number | boolean | object | undefined | null> | null | undefined;")


