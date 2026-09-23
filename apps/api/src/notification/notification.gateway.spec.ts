import { JwtService } from '@nestjs/jwt';
import { NotificationGateway } from './notification.gateway';

describe('NotificationGateway', () => {
  const jwt = new JwtService({ secret: 'test-secret' });
  let gateway: NotificationGateway;

  const socket = (token?: string) => ({
    id: 'sock-1',
    handshake: { auth: token ? { token } : {}, headers: {} },
    join: jest.fn(),
    disconnect: jest.fn(),
  });

  beforeEach(() => {
    gateway = new NotificationGateway(jwt);
  });

  it('joins a workspace owner to their own user room', () => {
    const s = socket(jwt.sign({ sub: 'user-1', email: 'a@x.test', name: 'A' }));

    gateway.handleConnection(s as any);

    expect(s.join).toHaveBeenCalledWith('user:user-1');
    expect(s.disconnect).not.toHaveBeenCalled();
  });

  it('accepts the token from the Authorization header too', () => {
    const s = socket();
    (s.handshake.headers as any).authorization = `Bearer ${jwt.sign({
      sub: 'user-1',
      email: 'a@x.test',
      name: 'A',
    })}`;

    gateway.handleConnection(s as any);

    expect(s.join).toHaveBeenCalledWith('user:user-1');
  });

  it('rejects a client-portal token, as the HTTP guard does', () => {
    const s = socket(
      jwt.sign({
        sub: 'portal-user-1',
        email: 'c@x.test',
        clientPortalId: 'portal-1',
        kind: 'portal_user',
      }),
    );

    gateway.handleConnection(s as any);

    expect(s.join).not.toHaveBeenCalled();
    expect(s.disconnect).toHaveBeenCalled();
  });

  it('rejects a connection with no token', () => {
    const s = socket();

    gateway.handleConnection(s as any);

    expect(s.join).not.toHaveBeenCalled();
    expect(s.disconnect).toHaveBeenCalled();
  });

  it('rejects a token signed with another secret', () => {
    const forged = new JwtService({ secret: 'wrong' }).sign({ sub: 'user-1' });
    const s = socket(forged);

    gateway.handleConnection(s as any);

    expect(s.join).not.toHaveBeenCalled();
    expect(s.disconnect).toHaveBeenCalled();
  });
});
