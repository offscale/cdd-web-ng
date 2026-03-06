#!/bin/bash
find src/vendors/angular -type f -name "*.ts" -exec sed -i "s/type: 'any'/type: 'Record<string, never>'/g" {} +
find src/vendors/angular -type f -name "*.ts" -exec sed -i "s/(item: any)/(item: Record<string, never>)/g" {} +
find src/vendors/angular -type f -name "*.ts" -exec sed -i "s/(entity as any)/(entity as Record<string, never>)/g" {} +
find src/vendors/angular -type f -name "*.ts" -exec sed -i "s/payload as any/payload as Record<string, never>/g" {} +
find src/vendors/angular -type f -name "*.ts" -exec sed -i "s/Record<string, any>/Record<string, never>/g" {} +
find src/vendors/angular -type f -name "*.ts" -exec sed -i "s/(response: any)/(response: Blob | string | Record<string, never>)/g" {} +
find src/vendors/angular -type f -name "*.ts" -exec sed -i "s/Promise<any>/Promise<Record<string, never>>/g" {} +
find src/vendors/angular -type f -name "*.ts" -exec sed -i "s/Observable<any>/Observable<Record<string, never>>/g" {} +
find src/vendors/angular -type f -name "*.ts" -exec sed -i "s/HttpRequest<any>/HttpRequest<Blob | string | Record<string, never>>/g" {} +
find src/vendors/angular -type f -name "*.ts" -exec sed -i "s/HttpResponse<any>/HttpResponse<Blob | string | Record<string, never>>/g" {} +
find src/vendors/angular -type f -name "*.ts" -exec sed -i "s/InjectionToken<any>/InjectionToken<Record<string, never>>/g" {} +
find src/vendors/angular -type f -name "*.ts" -exec sed -i "s/HttpContextToken<any>/HttpContextToken<Record<string, never> | null>/g" {} +
find src/vendors/angular -type f -name "*.ts" -exec sed -i "s/: any =/: Record<string, never> =/g" {} +
find src/vendors/angular -type f -name "*.ts" -exec sed -i "s/const schema: any/const schema: Record<string, never>/g" {} +
find src/vendors/angular -type f -name "*.ts" -exec sed -i "s/as any)/as Record<string, never>)/g" {} +
find src/vendors/angular -type f -name "*.ts" -exec sed -i "s/as any,/as Record<string, never>,/g" {} +
find src/vendors/angular -type f -name "*.ts" -exec sed -i "s/as any;/as Record<string, never>;/g" {} +
find src/vendors/angular -type f -name "*.ts" -exec sed -i "s/(v: any)/(v: string | number | boolean)/g" {} +
find src/vendors/angular -type f -name "*.ts" -exec sed -i "s/let payload: any/let payload: Record<string, never>/g" {} +
find src/vendors/angular -type f -name "*.ts" -exec sed -i "s/const returnGeneric = \`any\`/const returnGeneric = \`Record<string, never>\`/g" {} +
find src/vendors/angular -type f -name "*.ts" -exec sed -i "s/responseType === 'any' ? 'any' : responseType || 'unknown'/responseType === 'any' ? 'Record<string, never>' : responseType || 'Record<string, never>'/g" {} +

# also replace unknown to Record<string, never> where applicable
find src/vendors/angular -type f -name "*.ts" -exec sed -i "s/type: 'unknown'/type: 'Record<string, never>'/g" {} +
find src/vendors/angular -type f -name "*.ts" -exec sed -i "s/Record<string, unknown>/Record<string, never>/g" {} +
find src/vendors/angular -type f -name "*.ts" -exec sed -i "s/<unknown>/<Record<string, never>>/g" {} +
find src/vendors/angular -type f -name "*.ts" -exec sed -i "s/(value: unknown)/(value: Record<string, never> | string | number | boolean | null)/g" {} +
find src/vendors/angular -type f -name "*.ts" -exec sed -i "s/value: unknown/value: Record<string, never> | string | number | boolean | null/g" {} +
