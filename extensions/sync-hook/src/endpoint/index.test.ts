import { describe, it, expect, vi } from 'vitest';

vi.mock('@directus/extensions-sdk', () => ({
  // defineEndpoint is a passthrough at runtime; we don't reach for the mocked
  // value in the test (we import `registerEndpoint` directly), but the mock
  // prevents Vitest from loading the SDK's full module graph.
  defineEndpoint: (callback: unknown) => callback,
}));

import { registerEndpoint } from './index';
import packageJson from '../../package.json';

type RouteHandler = (req: unknown, res: { json: (body: unknown) => void }) => void;

describe('endpoint /status route', () => {
  it('responds with installed=true and the package.json version', () => {
    const routes = new Map<string, RouteHandler>();
    const fakeRouter = {
      get: (path: string, handler: RouteHandler) => routes.set(path, handler),
    };

    registerEndpoint(fakeRouter);

    const handler = routes.get('/status');
    expect(handler).toBeDefined();

    let captured: unknown;
    handler!(undefined, { json: (body) => (captured = body) });

    expect(captured).toEqual({ installed: true, version: packageJson.version });
  });
});
