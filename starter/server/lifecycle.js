import { badRequest, forbidden, lastOwner } from "./http.js";
import { resolve } from "./permissions.js";
import { audit } from "./audit.js";
export const roleRanks = (db) =>
  Object.fromEntries(
    db
      .prepare("SELECT key,rank FROM roles")
      .all()
      .map((r) => [r.key, r.rank]),
  );
export function assertRoleExists(db, role) {
  if (
    typeof role !== "string" ||
    !db.prepare("SELECT key FROM roles WHERE key=?").get(role)
  )
    throw badRequest("Unknown role");
}
export function assertCanModify(db, callerRole, targetRole) {
  const ranks = roleRanks(db);
  if (callerRole !== "owner" && !(ranks[callerRole] > ranks[targetRole]))
    throw forbidden("You may only modify a lower-ranked member", "role_rank");
}
export function assertNotLastOwner(db, orgId, userId) {
  const m = db
    .prepare("SELECT role,status FROM memberships WHERE org_id=? AND user_id=?")
    .get(orgId, userId);
  if (
    m?.role === "owner" &&
    m.status === "active" &&
    db
      .prepare(
        "SELECT count(*) n FROM memberships WHERE org_id=? AND role='owner' AND status='active'",
      )
      .get(orgId).n <= 1
  )
    throw lastOwner();
}
export function endActiveSessions(
  db,
  { orgId, userId, deviceId, reason, exceptSessionId },
) {
  const rows = db
    .prepare(
      "SELECT id FROM sessions WHERE org_id=? AND state IN ('active','connecting') AND (? IS NULL OR user_id=?) AND (? IS NULL OR device_id=?) AND (? IS NULL OR id<>?)",
    )
    .all(
      orgId,
      userId ?? null,
      userId ?? null,
      deviceId ?? null,
      deviceId ?? null,
      exceptSessionId ?? null,
      exceptSessionId ?? null,
    );
  for (const row of rows) {
    db.prepare(
      "UPDATE sessions SET state='ended',end_reason=?,ended_at=? WHERE id=?",
    ).run(reason, new Date().toISOString(), row.id);
    audit(db, {
      orgId,
      action: "session.end",
      targetType: "session",
      targetId: row.id,
      result: "allow",
      reasonCode: reason,
    });
  }
}
export function expireSessions(db) {
  const now = new Date().toISOString();
  db.transaction(() => {
    const rows = db
      .prepare(
        "SELECT id,org_id FROM sessions WHERE state IN ('active','connecting') AND expires_at<=?",
      )
      .all(now);
    for (const s of rows) {
      db.prepare(
        "UPDATE sessions SET state='ended',end_reason='session_expired',ended_at=? WHERE id=?",
      ).run(now, s.id);
      audit(db, {
        orgId: s.org_id,
        action: "session.expire",
        targetType: "session",
        targetId: s.id,
        result: "allow",
        reasonCode: "session_expired",
      });
    }
  }).immediate();
}
export function snapshotAuthority(db, ctx) {
  return JSON.stringify(resolve(db, ctx));
}
export function sessionExpiry(db, orgId) {
  return new Date(
    Date.now() +
      db
        .prepare("SELECT max_session_minutes n FROM organizations WHERE id=?")
        .get(orgId).n *
        60000,
  ).toISOString();
}
