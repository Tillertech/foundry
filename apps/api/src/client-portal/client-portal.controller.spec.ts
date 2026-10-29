import { ClientPortalController } from './client-portal.controller';
import { ClientPortalService } from './client-portal.service';
import { WorkspaceScope } from '../common/workspace-scope/workspace-scope';

describe('ClientPortalController', () => {
  let controller: ClientPortalController;

  beforeEach(() => {
    const service = new ClientPortalService(
      undefined as any,
      undefined as any,
      undefined as any,
      undefined as any,
      new WorkspaceScope(),
    );
    controller = new ClientPortalController(service);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
