import { PortalUsersController } from './portal-users.controller';
import { PortalUsersService } from './portal-users.service';

describe('PortalUsersController', () => {
  let controller: PortalUsersController;

  beforeEach(() => {
    const service = new PortalUsersService(
      undefined as any,
      undefined as any,
      undefined as any,
    );
    controller = new PortalUsersController(service);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
