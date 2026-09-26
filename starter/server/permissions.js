import { badRequest, forbidden } from './http.js';
export const MODE_PERMISSION = { view:'device:view', control:'device:control', terminal:'device:terminal' };
const matches = (pattern, permission) => pattern === '*' || pattern === permission || (pattern.endsWith(':*') && permission.startsWith(pattern.slice(0,-1)));

// All list rows share these reads. No authority survives the request's lifetime.
function inputs(db, {userId,orgId,now=new Date()}) {
  const catalogue=db.prepare('SELECT key FROM permissions ORDER BY key').all().map(p=>p.key);
  const membership=db.prepare(`SELECT m.* FROM memberships m JOIN organizations o ON o.id=m.org_id WHERE m.user_id=? AND m.org_id=? AND o.deleted_at IS NULL`).get(userId,orgId);
  const baseline=new Set(membership?db.prepare('SELECT permission FROM role_permissions WHERE role=?').all(membership.role).map(p=>p.permission):[]);
  const grants=db.prepare(`SELECT g.id,g.device_id,g.effect,gp.permission FROM grants g JOIN grant_permissions gp ON gp.grant_id=g.id
    WHERE g.org_id=? AND g.user_id=? AND g.revoked_at IS NULL AND (g.starts_at IS NULL OR g.starts_at<=?) AND (g.expires_at IS NULL OR g.expires_at>?) ORDER BY g.id`).all(orgId,userId,now.toISOString(),now.toISOString());
  const devices=db.prepare('SELECT id FROM devices WHERE org_id=? AND deleted_at IS NULL ORDER BY id').all(orgId).map(d=>d.id);
  return {catalogue,membership,baseline,grants,devices};
}
function atScope(input, deviceId) {
  const {catalogue,membership,baseline,grants,devices}=input;
  const reason=!membership||['removed','invited'].includes(membership.status)?'not_a_member':membership.status==='suspended'?'suspended':deviceId&&!devices.includes(deviceId)?'scope_mismatch':null;
  return Object.fromEntries(catalogue.map(permission=>{
    if(reason)return [permission,{effect:'deny',source:null,reason}];
    const applicable=grants.filter(g=>(!g.device_id||g.device_id===deviceId)&&matches(g.permission,permission));
    const deny=applicable.find(g=>g.effect==='deny');
    if(deny)return [permission,{effect:'deny',source:`grant:${deny.id}`,reason:'explicit_deny'}];
    if(baseline.has(permission))return [permission,{effect:'allow',source:`role:${membership.role}`,reason:null}];
    const allow=applicable.find(g=>g.effect==='allow');
    return [permission,allow?{effect:'allow',source:`grant:${allow.id}`,reason:null}:{effect:'deny',source:null,reason:'implicit'}];
  }));
}
function resolved(input, deviceId) {
  if(deviceId!==null)return atScope(input,deviceId);
  // Union for navigation: an allowance on one device does not authorize any other.
  const scopes=input.devices.length?input.devices.map(id=>atScope(input,id)):[atScope(input,null)];
  return Object.fromEntries(input.catalogue.map(p=>[p,scopes.map(s=>s[p]).find(v=>v.effect==='allow')||scopes.map(s=>s[p]).find(v=>v.reason==='explicit_deny')||scopes[0][p]]));
}
export function resolve(db, {userId,orgId,deviceId=null,now=new Date()}) {
  const input=inputs(db,{userId,orgId,now});return {role:input.membership?.role||null,permissions:resolved(input,deviceId)};
}
export function resolveDevices(db, {userId,orgId,deviceIds,now=new Date()}) {
  const input=inputs(db,{userId,orgId,now});return {role:input.membership?.role||null,byDevice:Object.fromEntries(deviceIds.map(id=>[id,atScope(input,id)]))};
}
function requestInput(db,ctx) {
  // A context is constructed for each HTTP request. Direct test contexts have no `now`.
  if(!ctx.now)return inputs(db,ctx);
  return ctx.permissionInput ||= inputs(db,ctx);
}
export function can(db,ctx,permission,deviceId=null) {return resolved(requestInput(db,ctx),deviceId)[permission]?.effect==='allow';}
export function assertCan(db,ctx,permission,deviceId=null) {
  const result=resolved(requestInput(db,ctx),deviceId)[permission];
  if(result?.effect!=='allow')throw forbidden(`Permission required: ${permission}`,result?.reason==='explicit_deny'?'explicit_deny':result?.reason==='suspended'?'suspended':'missing_permission');
}
export function assertMayGrant(db,ctx,patterns,deviceId=null) {
  const input=requestInput(db,ctx),valid=new Set(db.prepare('SELECT pattern FROM permission_patterns').all().map(p=>p.pattern));
  if(!Array.isArray(patterns)||!patterns.length||patterns.some(p=>typeof p!=='string'||!valid.has(p)))throw badRequest('Unknown permission pattern','unknown_permission');
  const expanded=input.catalogue.filter(p=>patterns.some(pattern=>matches(pattern,p)));
  // Org-wide authority must hold everywhere and at the unscoped baseline, including future devices.
  const scopes=deviceId?[deviceId]:[null,...input.devices];
  for(const scope of scopes){const set=atScope(input,scope);if(expanded.some(p=>set[p].effect!=='allow'))throw forbidden('Cannot grant authority you do not hold at this scope','scope_mismatch');}
}
export function assertCanStartSession(db,ctx,mode,deviceId) {
  if(!Object.hasOwn(MODE_PERMISSION,mode))throw badRequest('Invalid session mode');
  assertCan(db,ctx,'session:start',deviceId);
  if(!can(db,ctx,MODE_PERMISSION[mode],deviceId))throw forbidden(`Mode requires ${MODE_PERMISSION[mode]}`,'missing_device_permission');
}
