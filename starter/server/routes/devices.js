import { add, text, member, device } from './shared.js';
import { assertCan, can, resolve, resolveDevices, assertMayGrant } from '../permissions.js';
import { endActiveSessions } from '../lifecycle.js';
import { newId, nowIso, bumpPermVersion } from '../db.js';
import { badRequest, forbidden, notFound, conflict, normalizeTs, HttpError } from '../http.js';
function retireDeviceGrants(db,orgId,deviceId){const targets=db.prepare('SELECT DISTINCT user_id FROM grants WHERE org_id=? AND device_id=? AND revoked_at IS NULL').all(orgId,deviceId);db.prepare('UPDATE grants SET revoked_at=? WHERE org_id=? AND device_id=? AND revoked_at IS NULL').run(nowIso(),orgId,deviceId);for(const t of targets)bumpPermVersion(db,{orgId,userId:t.user_id});}
function visible(ctx,id){const d=device(ctx.db,ctx.orgId,id);if(!can(ctx.db,ctx,'device:view',id))throw notFound();return d;}
export function registerDevices(router){
  add(router,'get','/v1/orgs/:org/devices',ctx=>{
    assertCan(ctx.db,ctx,'device:list');const rows=ctx.db.prepare('SELECT * FROM devices WHERE org_id=? AND deleted_at IS NULL ORDER BY name').all(ctx.orgId);
    const {byDevice}=resolveDevices(ctx.db,{...ctx,deviceIds:rows.map(d=>d.id)});
    return {devices:rows.filter(d=>byDevice[d.id]['device:view']?.effect==='allow').map(d=>({...d,online:!!d.online,permissions:byDevice[d.id]}))};
  });
  add(router,'get','/v1/orgs/:org/devices/:id',(ctx,p)=>{const d=visible(ctx,p.id);return {...d,online:!!d.online,permissions:resolve(ctx.db,{...ctx,deviceId:d.id}).permissions};});
  add(router,'post','/v1/orgs/:org/devices',ctx=>{
    assertCan(ctx.db,ctx,'device:provision');const name=text(ctx.body.name,'name');if(!['macos','windows','linux','android','ios'].includes(ctx.body.kind))throw badRequest('Invalid device kind');
    if(ctx.db.prepare('SELECT id FROM devices WHERE org_id=? AND name=? COLLATE NOCASE AND deleted_at IS NULL').get(ctx.orgId,name))throw conflict('Device name already exists');
    const id=newId('dev');ctx.db.prepare('INSERT INTO devices (id,org_id,name,kind) VALUES (?,?,?,?)').run(id,ctx.orgId,name,ctx.body.kind);return {id,name,kind:ctx.body.kind,online:false};
  },{write:true,status:201,action:'device.provision',targetType:'device'});
  add(router,'patch','/v1/orgs/:org/devices/:id',(ctx,p)=>{
    const d=visible(ctx,p.id);assertCan(ctx.db,ctx,'device:update',d.id);const name=text(ctx.body.name,'name');
    if(ctx.db.prepare('SELECT id FROM devices WHERE org_id=? AND name=? COLLATE NOCASE AND id<>? AND deleted_at IS NULL').get(ctx.orgId,name,d.id))throw conflict('Device name already exists');
    ctx.db.prepare('UPDATE devices SET name=? WHERE id=?').run(name,d.id);return {...d,name};
  },{write:true,action:'device.update',targetType:'device'});
  add(router,'delete','/v1/orgs/:org/devices/:id',(ctx,p)=>{
    const d=visible(ctx,p.id);assertCan(ctx.db,ctx,'device:provision',d.id);endActiveSessions(ctx.db,{orgId:ctx.orgId,deviceId:d.id,reason:'device_transferred'});retireDeviceGrants(ctx.db,ctx.orgId,d.id);ctx.db.prepare('UPDATE devices SET deleted_at=? WHERE id=?').run(nowIso(),d.id);
  },{write:true,action:'device.decommission',targetType:'device'});
  add(router,'post','/v1/orgs/:org/devices/:id/transfer',(ctx,p)=>{
    const d=visible(ctx,p.id),target=text(ctx.body.orgId??ctx.body.targetOrgId,'orgId');if(target===ctx.orgId)throw badRequest('Choose a different destination organization');
    assertCan(ctx.db,ctx,'device:provision',d.id);
    const m=ctx.db.prepare("SELECT m.* FROM memberships m JOIN organizations o ON o.id=m.org_id WHERE m.org_id=? AND m.user_id=? AND m.status='active' AND o.deleted_at IS NULL").get(target,ctx.userId);if(!m)throw notFound();
    assertCan(ctx.db,{userId:ctx.userId,orgId:target},'device:provision');
    if(ctx.db.prepare('SELECT id FROM devices WHERE org_id=? AND name=? COLLATE NOCASE AND deleted_at IS NULL').get(target,d.name))throw conflict('Destination already has a device with this name');
    endActiveSessions(ctx.db,{orgId:ctx.orgId,deviceId:d.id,reason:'device_transferred'});retireDeviceGrants(ctx.db,ctx.orgId,d.id);ctx.db.prepare('UPDATE devices SET org_id=? WHERE id=?').run(target,d.id);return {...d,org_id:target};
  },{write:true,action:'device.transfer',targetType:'device'});
  add(router,'get','/v1/orgs/:org/grants',ctx=>{
    assertCan(ctx.db,ctx,'user:read');const grants=ctx.db.prepare('SELECT * FROM grants WHERE org_id=? AND revoked_at IS NULL AND (? IS NULL OR user_id=?) ORDER BY created_at DESC,id').all(ctx.orgId,ctx.query.get('userId'),ctx.query.get('userId'));
    const patterns=ctx.db.prepare('SELECT gp.* FROM grant_permissions gp JOIN grants g ON gp.grant_id=g.id WHERE g.org_id=? AND g.revoked_at IS NULL ORDER BY gp.permission').all(ctx.orgId);const byGrant=new Map();for(const p of patterns){if(!byGrant.has(p.grant_id))byGrant.set(p.grant_id,[]);byGrant.get(p.grant_id).push(p.permission);}
    return {grants:grants.map(g=>({...g,permissions:byGrant.get(g.id)||[]}))};
  });
  add(router,'post','/v1/orgs/:org/grants',ctx=>{
    assertCan(ctx.db,ctx,'grant:create');const b=ctx.body;if(b.userId===ctx.userId)throw forbidden('Self grants are not allowed','self_grant');
    const m=member(ctx.db,ctx.orgId,b.userId);if(m.status!=='active')throw notFound();const deviceId=b.deviceId??null;if(deviceId)visible(ctx,deviceId);
    if(!['allow','deny'].includes(b.effect))throw badRequest('Effect must be allow or deny');
    if(!Array.isArray(b.permissions)||!b.permissions.length)throw badRequest('Select at least one permission');
    const startsAt=normalizeTs(b.startsAt,'startsAt'),expiresAt=normalizeTs(b.expiresAt,'expiresAt');if(expiresAt&&expiresAt<=nowIso())throw new HttpError(400,'GRANT_EXPIRED','Grant expiry is in the past','expired_grant');if(startsAt&&expiresAt&&expiresAt<=startsAt)throw badRequest('Expiry must follow start');
    assertMayGrant(ctx.db,ctx,b.permissions,deviceId);const id=newId('grt');ctx.db.prepare('INSERT INTO grants (id,org_id,user_id,device_id,effect,starts_at,expires_at,created_by) VALUES (?,?,?,?,?,?,?,?)').run(id,ctx.orgId,b.userId,deviceId,b.effect,startsAt,expiresAt,ctx.userId);
    for(const p of new Set(b.permissions))ctx.db.prepare('INSERT INTO grant_permissions (grant_id,permission) VALUES (?,?)').run(id,p);
    bumpPermVersion(ctx.db,{orgId:ctx.orgId,userId:b.userId});return {id,...b,device_id:deviceId,user_id:b.userId,starts_at:startsAt,expires_at:expiresAt};
  },{write:true,status:201,action:'grant.create',targetType:'grant'});
  add(router,'delete','/v1/orgs/:org/grants/:id',(ctx,p)=>{
    const grant=ctx.db.prepare('SELECT * FROM grants WHERE id=? AND org_id=? AND revoked_at IS NULL').get(p.id,ctx.orgId);if(!grant)throw notFound();assertCan(ctx.db,ctx,'grant:revoke');ctx.db.prepare('UPDATE grants SET revoked_at=? WHERE id=?').run(nowIso(),grant.id);bumpPermVersion(ctx.db,{orgId:ctx.orgId,userId:grant.user_id});
  },{write:true,action:'grant.revoke',targetType:'grant'});
}
