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
  email: string;
  password: string;
}

export interface AcceptInviteRequest {
  email: string;
  token: string;
  password: string;
}

export interface ForgotPortalPasswordRequest {
  email: string;
}

export interface ResetPortalPasswordRequest {
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
  clientPortal: {
    id: string;
    slug: string;
    active: boolean;
    permission: PortalPermission;
    client: {
      id: string;
      name: string;
      company: string | null;
    };
  };
}
