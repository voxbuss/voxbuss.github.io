# voxbuss

Värmlandstrafik departure board, journey planner and live vehicle map.

## Cloudflare Worker configuration

Deploy `worker.js` as a Cloudflare Worker and configure these Production bindings in **Settings → Variables and Secrets**:

| Name | Type | Trafiklab API |
| --- | --- | --- |
| `ALLOWED_ORIGIN` | Text variable | Your Pages origin, e.g. `https://voxbuss.github.io` |
| `TRAFIKLAB_API_KEY` | Secret | Trafiklab Realtime APIs |
| `RESROBOT_API_KEY` | Secret | ResRobot v2.1 |
| `GTFS_REGIONAL_REALTIME_API_KEY` | Secret | GTFS Regional Realtime |

The last two keys power the route planner and Värmland vehicle-position map. Keep every API key in Cloudflare Secrets; never put keys in `app.js`, GitHub Pages files, or a checked-in Wrangler config.

The browser uses the Worker URL configured near the top of `app.js`. After changing Worker code or bindings, deploy the Worker again. The Worker restricts browser requests to `ALLOWED_ORIGIN`.

## Publish with GitHub Pages

Publish the repository using GitHub Pages. The pages site and Worker must use HTTPS. For the organization site `https://voxbuss.github.io`, set `ALLOWED_ORIGIN` to exactly that origin (no path or trailing slash).
