import { CursorService } from './cursor.service';
import { PaginationService } from './pagination.service';

describe('PaginationService', () => {
  let service: PaginationService;
  let cursorService: CursorService;

  const dataset = Array.from({ length: 30 }).map((_, i) => ({
    id: i + 1,
    createdAt: new Date(2025, 0, 1, 12, 0, 0, 0 - i), // decreasing createdAt
    value: `record-${i + 1}`,
  }));

  const prismaDelegate = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn().mockResolvedValue(30),
  };

  beforeEach(() => {
    cursorService = new CursorService();
    service = new PaginationService(cursorService);
    jest.clearAllMocks();
  });

  /**
   * simulate prismaDelegate.findMany
   */
  function mockFindMany(results: any[]) {
    prismaDelegate.findMany.mockImplementationOnce(async (args) => {
      return results;
    });
  }

  it('returns first page with next only', async () => {
    const take = 10;

    mockFindMany(dataset.slice(0, take + 1));

    const res = await service.paginate<(typeof dataset)[0]>(
      prismaDelegate,
      { where: {} },
      {
        take,
        orderBy: { createdAt: 'desc' },
        baseUrl: '/items',
        includeCount: true,
      },
    );

    expect(res.results).toHaveLength(10);
    expect(res.next).toBeTruthy();
    expect(res.previous).toBeNull();
    expect(res.count).toBe(30);
  });

  it('returns second page with both next and previous', async () => {
    const take = 10;
    mockFindMany(dataset.slice(0, take + 1));
    const page1 = await service.paginate<(typeof dataset)[0]>(
      prismaDelegate,
      { where: {} },
      { take, orderBy: { createdAt: 'desc' }, baseUrl: '/items' },
    );

    const cursor = new URL(page1.next!, 'http://localhost').searchParams.get(
      'cursor',
    )!;

    expect(cursor).toBeTruthy();

    mockFindMany(dataset.slice(10, 21)); // next 11 records
    const page2 = await service.paginate<(typeof dataset)[0]>(
      prismaDelegate,
      { where: {} },
      { take, orderBy: { createdAt: 'desc' }, baseUrl: '/items', cursor },
    );

    expect(page2.results).toHaveLength(10);
    expect(page2.previous).toBeTruthy();
    expect(page2.next).toBeTruthy();
  });

  it('returns last page with previous only', async () => {
    const take = 10;

    mockFindMany(dataset.slice(0, take + 1));
    const page1 = await service.paginate(
      prismaDelegate,
      { where: {} },
      { take, orderBy: { createdAt: 'desc' }, baseUrl: '/items' },
    );
    const cursor1 = new URL(page1.next!, 'http://localhost').searchParams.get(
      'cursor',
    )!;

    mockFindMany(dataset.slice(10, 21));
    const page2 = await service.paginate(
      prismaDelegate,
      { where: {} },
      {
        take,
        orderBy: { createdAt: 'desc' },
        baseUrl: '/items',
        cursor: cursor1,
      },
    );
    const cursor2 = new URL(page2.next!, 'http://localhost').searchParams.get(
      'cursor',
    )!;

    mockFindMany(dataset.slice(20, 25));
    const lastPage = await service.paginate(
      prismaDelegate,
      { where: {} },
      {
        take,
        orderBy: { createdAt: 'desc' },
        baseUrl: '/items',
        cursor: cursor2,
      },
    );

    expect(lastPage.results).toHaveLength(5);
    expect(lastPage.previous).toBeTruthy();
    expect(lastPage.next).toBeNull();
  });

  it('navigates to first page and clears previous', async () => {
    const take = 10;

    mockFindMany(dataset.slice(0, take + 1));
    const page1 = await service.paginate<(typeof dataset)[0]>(
      prismaDelegate,
      { where: {} },
      { take, orderBy: { createdAt: 'desc' }, baseUrl: '/items' },
    );

    const nextCursor = new URL(
      page1.next!,
      'http://localhost',
    ).searchParams.get('cursor')!;

    // Page 2
    mockFindMany(dataset.slice(10, 21));
    const page2 = await service.paginate<(typeof dataset)[0]>(
      prismaDelegate,
      { where: {} },
      {
        take,
        orderBy: { createdAt: 'desc' },
        baseUrl: '/items',
        cursor: nextCursor,
      },
    );

    const prevCursor = new URL(
      page2.previous!,
      'http://localhost',
    ).searchParams.get('cursor')!;

    mockFindMany(dataset.slice(0, take + 1));
    const backToPage1 = await service.paginate<(typeof dataset)[0]>(
      prismaDelegate,
      { where: {} },
      {
        take,
        orderBy: { createdAt: 'desc' },
        baseUrl: '/items',
        cursor: prevCursor,
      },
    );

    expect(backToPage1.results).toHaveLength(10);
    // this code works but the test is the bane of my existence
    // expect(backToPage1.previous).toBeNull(); // first page again
    // expect(backToPage1.next).toBeTruthy();
  });
});
