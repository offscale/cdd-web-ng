import os

p = 'src/vendors/angular/test/service-test-generator.ts'
with open(p, 'r') as f:
    c = f.read()

# 1. Update return type of getMethodTypes
c = c.replace(
"""    private getMethodTypes(op: PathInfo): {
        responseModel?: string;
        responseType: string;
        bodyModel?: string;
        isPrimitiveBody: boolean;
    } {""",
"""    private getMethodTypes(op: PathInfo): {
        responseModel?: string;
        responseType: string;
        bodyModel?: string;
        bodyType: string;
        isPrimitiveBody: boolean;
    } {"""
)

# 2. Add bodyType to return object of getMethodTypes
c = c.replace(
"""        return {
            responseType,
            isPrimitiveBody,""",
"""        return {
            responseType,
            bodyType,
            isPrimitiveBody,"""
)

# 3. Get bodyType from getMethodTypes
c = c.replace(
"const { responseModel, responseType, bodyModel, isPrimitiveBody } = this.getMethodTypes(op);",
"const { responseModel, responseType, bodyModel, bodyType, isPrimitiveBody } = this.getMethodTypes(op);"
)

# 4. Add type to bodyParam
c = c.replace(
"""                  model: bodyModel,
                      isPrimitive: isPrimitiveBody,
                  }""",
"""                  model: bodyModel,
                      type: bodyType,
                      isPrimitive: isPrimitiveBody,
                  }"""
)

# 5. Fix type casts in lines.push
c = c.replace(
    "as ${bodyParam.model || 'string | number | boolean | object | undefined | null'};",
    "as ${bodyParam.type};"
)

with open(p, 'w') as f:
    f.write(c)

