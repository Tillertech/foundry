import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { API_BASE } from '../../core/http/api-base';
import { ApiTokenStore } from './api-token.store';
import { MessageResponse } from '../../core/http/api.types';
import {
  AuthResponse,
  ForgotPasswordRequest,
  LoginChallenge,
  LoginRequest,
  MeResponse,
  ResendVerificationRequest,
  ResetPasswordRequest,
  SignupRequest,
  SignupResponse,
  VerifyEmailRequest,
  VerifyLoginRequest,
} from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly tokenStore = inject(ApiTokenStore);
  private readonly base = `${API_BASE}/auth`;

  /**
   * Creates the account plus its default workspace and emails a verification
   * code. No token is issued until the email is confirmed via verifyEmail().
   */
  signup(body: SignupRequest): Observable<SignupResponse> {
    return this.http.post<SignupResponse>(`${this.base}/signup`, body);
  }

  /** Confirms the emailed code and stores the returned JWT. */
  verifyEmail(body: VerifyEmailRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.base}/verify-email`, body)
      .pipe(tap((res) => this.tokenStore.set(res.accessToken)));
  }

  resendVerification(
    body: ResendVerificationRequest,
  ): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(
      `${this.base}/resend-verification`,
      body,
    );
  }

  /** Verifies credentials and triggers a sign-in code; issues no token yet. */
  login(body: LoginRequest): Observable<LoginChallenge> {
    return this.http.post<LoginChallenge>(`${this.base}/login`, body);
  }

  /** Confirms the emailed sign-in code and stores the returned JWT. */
  verifyLogin(body: VerifyLoginRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.base}/verify-login`, body)
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
