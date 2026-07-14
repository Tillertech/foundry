export interface SignupRequest {
  name: string;
  email: string;
  password: string;
  workspaceName?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export interface MeResponse extends AuthUser {
  workspaces: unknown[];
}

export interface SignupResponse {
  email: string;
  message: string;
}

/** Returned by POST /auth/login - credentials ok, a sign-in code was emailed. */
export interface LoginChallenge {
  email: string;
  message: string;
}

export interface VerifyEmailRequest {
  email: string;
  otp: string;
}

export interface VerifyLoginRequest {
  email: string;
  otp: string;
}

export interface ResendVerificationRequest {
  email: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  otp: string;
  newPassword: string;
}
