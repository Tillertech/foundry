import { ClientPortalController } from './client-portal.controller';
import { ClientPortalService } from './client-portal.service';

describe('ClientPortalController', () => {
  let controller: ClientPortalController;

  beforeEach(() => {
    const service = new ClientPortalService(
      undefined as any,
      undefined as any,
      undefined as any,
    );
    controller = new ClientPortalController(service);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
