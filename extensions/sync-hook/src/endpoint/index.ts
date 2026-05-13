import { defineEndpoint } from '@directus/extensions-sdk';
import packageJson from '../../package.json';

// Structural subset of Express' Router — `defineEndpoint` will accept this
// because Router's `get` is assignable to ours. Used so the test can pass a
// fake router without bridging to the full Router type via a cast.
type MinimalRouter = {
  get(path: string, handler: (req: unknown, res: { json: (body: unknown) => void }) => void): unknown;
};

export const registerEndpoint = (router: MinimalRouter): void => {
  router.get('/status', (_req, res) => {
    res.json({ installed: true, version: packageJson.version });
  });
};

// The module-side Automation page pings GET /localazy-automation/status to
// detect whether this server-side bundle is installed and reachable. The URL
// prefix `/localazy-automation` comes from this endpoint child's `name` field
// in package.json (see @directus/api extension manager).
export default defineEndpoint(registerEndpoint);
