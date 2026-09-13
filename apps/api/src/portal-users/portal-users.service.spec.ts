import { PortalUsersService } from './portal-users.service';

describe('PortalUsersService', () => {
  let service: PortalUsersService;

  beforeEach(() => {
    service = new PortalUsersService(
      undefined as any, // PrismaService
      undefined as any, // ClientPortalService
      undefined as any, // PaginationService
      undefined as any, // EventEmitter2
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
