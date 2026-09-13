export const PortalEvents = {
  USER_INVITED: 'portal.user_invited',
} as const;

export interface PortalUserInvitedEvent {
  email: string;
  name: string;
  portalSlug: string;
  /** Plaintext invite token - single use, expires like an OTP. Never persisted as-is. */
  token: string;
}
