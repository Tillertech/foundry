import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE, PaginatedResponse, toParams } from '@foundry/shared-util';
import {
  CreatePortalUserRequest,
  ListPortalUserQuery,
  PortalUser,
  UpdatePortalUserRequest,
} from './portal-user.models';

@Injectable({ providedIn: 'root' })
export class PortalUsersApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/portal-users`;

  /** Invites a user: they get an emailed link to set their own password. */
  create(body: CreatePortalUserRequest): Observable<PortalUser> {
    return this.http.post<PortalUser>(this.base, body);
  }

  list(query?: ListPortalUserQuery): Observable<PaginatedResponse<PortalUser>> {
    return this.http.get<PaginatedResponse<PortalUser>>(this.base, {
      params: toParams(query as Record<string, unknown>),
    });
  }

  get(id: string): Observable<PortalUser> {
    return this.http.get<PortalUser>(`${this.base}/${id}`);
  }

  update(id: string, body: UpdatePortalUserRequest): Observable<PortalUser> {
    return this.http.patch<PortalUser>(`${this.base}/${id}`, body);
  }

  /** Emails a fresh invite link; the previous one stops working. */
  resendInvite(id: string): Observable<PortalUser> {
    return this.http.post<PortalUser>(`${this.base}/${id}/resend-invite`, {});
  }

  /** Revokes access outright - the user is removed from the portal. */
  delete(id: string): Observable<PortalUser> {
    return this.http.delete<PortalUser>(`${this.base}/${id}`);
  }
}
