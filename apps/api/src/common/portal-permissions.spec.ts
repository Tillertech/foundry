import {
  effectivePortalPermission,
  workspacePortalDefaults,
} from './portal-permissions';

const workspace = {
  portalViewProjects: true,
  portalViewDocuments: false,
  portalViewQuotes: true,
  portalViewPayments: false,
};
const own = {
  viewProjects: false,
  viewDocuments: true,
  viewQuotes: false,
  viewPayments: true,
};

describe('portal permissions', () => {
  it('maps the workspace columns onto the view flags', () => {
    expect(workspacePortalDefaults(workspace)).toEqual({
      viewProjects: true,
      viewDocuments: false,
      viewQuotes: true,
      viewPayments: false,
    });
  });

  it('follows the workspace defaults while the portal inherits, ignoring its own flags', () => {
    expect(
      effectivePortalPermission({ ...own, inherit: true }, workspace),
    ).toEqual(workspacePortalDefaults(workspace));
  });

  it("uses the portal's own flags once it stops inheriting", () => {
    expect(
      effectivePortalPermission({ ...own, inherit: false }, workspace),
    ).toEqual(own);
  });
});
