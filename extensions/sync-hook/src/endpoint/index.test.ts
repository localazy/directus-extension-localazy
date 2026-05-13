import { describe, it, expect, vi } from 'vitest';

vi.mock('@directus/extensions-sdk', () => ({
  // defineEndpoint is a passthrough at runtime; we capture the registration
  // callback and invoke it with a fake router below.
  defineEndpoint: (callback: unknown) => callback,
}));

// Import after vi.mock declarations. The default export is the registration
// callback (because of the mock above), so we cast it to a callable shape.
import endpointCallback from './index';

import packageJson from '../../package.json';

type RouteHandler = (req: unknown, res: { json: (body: unknown) => void }) => void;

describe('endpoint /status route', () => {
  it('responds with installed=true and the package.json version', () => {
    const routes = new Map<string, RouteHandler>();
    const fakeRouter = {
      get: (path: string, handler: RouteHandler) => {
        routes.set(path, handler);
      },
    };

    (endpointCallback as unknown as (r: typeof fakeRouter) => void)(fakeRouter);

    const handler = routes.get('/status');
    expect(handler).toBeDefined();

    let captured: unknown;
    const fakeRes = { json: (body: unknown) => (captured = body) };
    handler!(undefined, fakeRes);

    expect(captured).toEqual({ installed: true, version: packageJson.version });
  });
});
