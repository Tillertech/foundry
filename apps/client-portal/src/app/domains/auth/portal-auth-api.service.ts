import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE, MessageResponse } from '@foundry/shared-util';
import {
  AcceptInviteRequest,
  ForgotPortalPasswordRequest,
  PortalAuthResponse,
  PortalLoginRequest,
  PortalMe,
  ResetPortalPasswordRequest,
} from './portal-auth.models';

@Injectable({ providedIn: 'root' })
export class PortalAuthApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/portal-auth`;

  login(body: PortalLoginRequest): Observable<PortalAuthResponse> {
    return this.http.post<PortalAuthResponse>(`${this.base}/login`, body);
  }

  acceptInvite(body: AcceptInviteRequest): Observable<PortalAuthResponse> {
    return this.http.post<PortalAuthResponse>(
      `${this.base}/accept-invite`,
      body,
    );
  }

  forgotPassword(
    body: ForgotPortalPasswordRequest,
  ): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(
      `${this.base}/forgot-password`,
      body,
    );
  }

  resetPassword(body: ResetPortalPasswordRequest): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${this.base}/reset-password`, body);
  }

  me(): Observable<PortalMe> {
    return this.http.get<PortalMe>(`${this.base}/me`);
  }
}
