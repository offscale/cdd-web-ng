import os

p = 'src/vendors/angular/test/service-test-generator.ts'
with open(p, 'r') as f:
    c = f.read()

c = c.replace(
"""                if (bodyParam?.model) {
                    /* v8 ignore next */
                    let mockData = this.mockDataGenerator.generate(bodyParam.model);""",
"""                if (bodyParam?.model) {
                    /* v8 ignore next */
                    let mockData = this.mockDataGenerator.generate(bodyParam.model);
                    if (bodyParam.type.includes('[]') && mockData) mockData = `[${mockData}]`;"""
)

with open(p, 'w') as f:
    f.write(c)

