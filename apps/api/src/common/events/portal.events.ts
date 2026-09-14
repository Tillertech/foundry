export const PortalEvents = {
  USER_INVITED: 'portal.user_invited',
  PASSWORD_RESET_REQUESTED: 'portal.password_reset_requested',
} as const;

export interface PortalUserInvitedEvent {
  email: string;
  name: string;
  portalSlug: string;
  /** Plaintext invite token - single use, expires like an OTP. Never persisted as-is. */
  token: string;
}

export interface PortalPasswordResetRequestedEvent {
  email: string;
  name: string;
  /** Plaintext reset token - single use, expires like an OTP. Never persisted as-is. */
  token: string;
}
