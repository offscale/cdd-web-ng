import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export class PetService {
    constructor(private http: HttpClient) {}
    
    uploadFile(options?: any): Observable<string | number | boolean | object | undefined | null> {
        return this.http.post<string | number | boolean | object | undefined | null>('url', null, options as object);
    }
}
