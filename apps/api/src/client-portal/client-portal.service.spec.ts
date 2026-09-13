import { ClientPortalService } from './client-portal.service';

describe('ClientPortalService', () => {
  let service: ClientPortalService;

  beforeEach(() => {
    service = new ClientPortalService(
      undefined as any, // PrismaService
      undefined as any, // ClientsService
      undefined as any, // PaginationService
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
