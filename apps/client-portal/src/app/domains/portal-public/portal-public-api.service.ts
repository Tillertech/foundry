import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE } from '@foundry/shared-util';
import { PortalPublic } from './portal-public.models';

/** Unauthenticated lookup used to brand the pre-login screens by slug. */
@Injectable({ providedIn: 'root' })
export class PortalPublicApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/portal-public`;

  get(slug: string): Observable<PortalPublic> {
    return this.http.get<PortalPublic>(`${this.base}/${slug}`);
  }
}
