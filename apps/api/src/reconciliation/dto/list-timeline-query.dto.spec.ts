import { ValidationPipe, ArgumentMetadata } from '@nestjs/common';
import { ListTimelineQueryDto } from './list-timeline-query.dto';

describe('ListTimelineQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const metadata: ArgumentMetadata = {
    type: 'query',
    metatype: ListTimelineQueryDto,
  };

  it('parses the literal string "false" as false', async () => {
    const result = await pipe.transform(
      { includeProject: 'false' },
      metadata,
    );
    expect(result.includeProject).toBe(false);
  });

  it('parses the literal string "true" as true', async () => {
    const result = await pipe.transform({ includeProject: 'true' }, metadata);
    expect(result.includeProject).toBe(true);
  });

  it('defaults to undefined when omitted', async () => {
    const result = await pipe.transform({}, metadata);
    expect(result.includeProject).toBeUndefined();
  });
});
