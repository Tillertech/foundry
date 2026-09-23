import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { ListExpensesQueryDto } from './list-expenses-query.dto';

describe('ListExpensesQueryDto', () => {
  // Same options as the global pipe in main.ts.
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const metadata: ArgumentMetadata = {
    type: 'query',
    metatype: ListExpensesQueryDto,
  };

  it('parses billable=false as false, not Boolean("false") === true', async () => {
    const result = await pipe.transform({ billable: 'false' }, metadata);
    expect(result.billable).toBe(false);
  });

  it('parses billable=true as true', async () => {
    const result = await pipe.transform({ billable: 'true' }, metadata);
    expect(result.billable).toBe(true);
  });

  it('leaves billable undefined when omitted, so it does not filter', async () => {
    const result = await pipe.transform({}, metadata);
    expect(result.billable).toBeUndefined();
  });

  it('accepts a workspace filter', async () => {
    const workspaceId = '6f1c8a3e-2b4d-4c5e-9f70-1a2b3c4d5e6f';
    const result = await pipe.transform({ workspaceId }, metadata);
    expect(result.workspaceId).toBe(workspaceId);
  });

  it('rejects a malformed workspace id', async () => {
    await expect(
      pipe.transform({ workspaceId: 'not-a-uuid' }, metadata),
    ).rejects.toBeDefined();
  });
});
