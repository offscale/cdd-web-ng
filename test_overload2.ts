import { Observable, of } from 'rxjs';

interface ApiResponse {
    code?: number;
}

export class PetService {
    uploadFile(petId: number): Observable<ApiResponse>;
    uploadFile(petId: number, options: { observe: 'response' }): Observable<string>;
    uploadFile(petId: number, options?: any): Observable<Record<string, string | number | boolean | object | undefined | null>> {
        return of({} as any);
    }
}
