export const AuthEvents = {
  USER_SIGNED_UP: 'user.signed_up',
  PASSWORD_RESET_REQUESTED: 'auth.password_reset_requested',
  EMAIL_VERIFICATION_REQUESTED: 'auth.email_verification_requested',
  LOGIN_OTP_REQUESTED: 'auth.login_otp_requested',
} as const;

export interface UserSignedUpEvent {
  id: string;
  email: string;
}

export interface OtpMailEvent {
  email: string;
  name: string;
  otp: string;
}

export type PasswordResetRequestedEvent = OtpMailEvent;
export type EmailVerificationRequestedEvent = OtpMailEvent;
export type LoginOtpRequestedEvent = OtpMailEvent;
