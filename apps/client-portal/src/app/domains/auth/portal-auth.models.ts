import { Currency } from '@foundry/shared-util';

export interface PortalAuthUser {
  id: string;
  name: string;
  email: string;
  clientPortalId: string;
  /** Slug this portal is reached at (/:slug/...) - navigate here after auth. */
  portalSlug: string;
}

export interface PortalAuthResponse {
  accessToken: string;
  user: PortalAuthUser;
}

export interface PortalLoginRequest {
  /** The portal being signed into - an email can belong to several. */
  slug: string;
  email: string;
  password: string;
}

export interface AcceptInviteRequest {
  /** The portal being signed into - an email can belong to several. */
  slug: string;
  email: string;
  token: string;
  password: string;
}

export interface ForgotPortalPasswordRequest {
  /** The portal being signed into - an email can belong to several. */
  slug: string;
  email: string;
}

export interface ResetPortalPasswordRequest {
  /** The portal being signed into - an email can belong to several. */
  slug: string;
  email: string;
  token: string;
  password: string;
}

export interface PortalPermission {
  viewProjects: boolean;
  viewDocuments: boolean;
  viewQuotes: boolean;
  viewPayments: boolean;
}

export interface PortalMe {
  id: string;
  name: string;
  email: string;
  status: 'invited' | 'active' | 'suspended';
  /** May approve or request changes on delivered milestones. */
  canApproveMilestones: boolean;
  clientPortal: {
    id: string;
    slug: string;
    active: boolean;
    permission: PortalPermission;
    client: {
      id: string;
      name: string;
      company: string | null;
      /** What project budgets and rates are quoted in. */
      currency: Currency;
    };
  };
}
