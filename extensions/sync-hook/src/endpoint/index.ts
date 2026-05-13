import { defineEndpoint } from '@directus/extensions-sdk';
import packageJson from '../../package.json';

// Public health-check route for the Localazy automation bundle.
// The module-side Automation page pings GET /localazy-automation/status to
// detect whether this server-side bundle is installed and reachable.
// The URL prefix `/localazy-automation` is derived from this endpoint child's
// `name` field in package.json (see @directus/api extension manager).
export default defineEndpoint((router) => {
  router.get('/status', (_req, res) => {
    res.json({ installed: true, version: packageJson.version });
  });
});
