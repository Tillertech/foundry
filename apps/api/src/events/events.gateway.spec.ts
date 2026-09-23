import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EventsGateway } from './events.gateway';

describe('EventsGateway', () => {
  it('never rebroadcasts domain events on the unauthenticated socket', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' })],
      providers: [EventsGateway],
    }).compile();
    await moduleRef.init();

    const gateway = moduleRef.get(EventsGateway);
    const emit = jest.fn();
    gateway.server = { emit } as any;
    const bus = moduleRef.get(EventEmitter2);

    await bus.emitAsync('file.uploaded', {
      key: 'secret.pdf',
      url: 'http://api/uploads/secret.pdf',
    });
    await bus.emitAsync('entity.created', { id: 'x' });

    expect(emit).not.toHaveBeenCalled();
    await moduleRef.close();
  });

  it('still answers the liveness ping', () => {
    expect(new EventsGateway().ping().pong).toEqual(expect.any(Number));
  });
});
