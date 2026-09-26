import { registerAuth } from "./auth.js";
import { registerOrgs } from "./orgs.js";
import { registerInvites } from "./invites.js";
import { registerDevices } from "./devices.js";
import { registerSessions } from "./sessions.js";
export function registerRoutes(router) {
  registerAuth(router);
  registerOrgs(router);
  registerInvites(router);
  registerDevices(router);
  registerSessions(router);
}
