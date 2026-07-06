import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { API_BASE } from '../../core/http/api-base';
import { ApiTokenStore } from './api-token.store';
import { MessageResponse } from '../../core/http/api.types';
import {
  AuthResponse,
  ForgotPasswordRequest,
  LoginRequest,
  MeResponse,
  ResetPasswordRequest,
  SignupRequest,
} from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly tokenStore = inject(ApiTokenStore);
  private readonly base = `${API_BASE}/auth`;

  /** Creates the account plus its default workspace and stores the JWT. */
  signup(body: SignupRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.base}/signup`, body)
      .pipe(tap((res) => this.tokenStore.set(res.accessToken)));
  }

  login(body: LoginRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.base}/login`, body)
      .pipe(tap((res) => this.tokenStore.set(res.accessToken)));
  }

  me(): Observable<MeResponse> {
    return this.http.get<MeResponse>(`${this.base}/me`);
  }

  forgotPassword(body: ForgotPasswordRequest): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${this.base}/forgot-password`, body);
  }

  resetPassword(body: ResetPasswordRequest): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${this.base}/reset-password`, body);
  }

  logout(): void {
    this.tokenStore.clear();
  }
}
