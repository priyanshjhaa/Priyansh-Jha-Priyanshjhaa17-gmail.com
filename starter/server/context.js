import { verifyAccessToken, assertFresh } from './auth.js';
import { unauthenticated, forbidden, notFound } from './http.js';
export function authenticate(db, secret) {
  return (req, params) => {
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || '');
    if (!match) throw unauthenticated();
    const claims = verifyAccessToken(match[1], secret);
    if (params.org && params.org !== claims.org) throw notFound();
    const membership = db.prepare(`SELECT m.* FROM memberships m JOIN organizations o ON o.id=m.org_id
      JOIN users u ON u.id=m.user_id WHERE m.user_id=? AND m.org_id=? AND o.deleted_at IS NULL`).get(claims.sub, claims.org);
    if (!membership || membership.status === 'removed' || membership.status === 'invited') throw unauthenticated();
    if (membership.status === 'suspended') throw forbidden('membership is suspended', 'suspended');
    assertFresh(claims, membership);
    return { userId: claims.sub, orgId: claims.org, role: membership.role, membership, claims, now: new Date() };
  };
}
