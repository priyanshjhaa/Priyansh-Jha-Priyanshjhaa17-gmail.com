import { newId, nowIso, bumpPermVersion } from '../db.js';
import { assertCan, resolve } from '../permissions.js';
import { assertCanModify, assertRoleExists, assertNotLastOwner, endActiveSessions } from '../lifecycle.js';
import { forbidden, selfRoleChange, notFound, badRequest, conflict } from '../http.js';
import { add, text, member, pagination } from './shared.js';
import { organizations } from './auth.js';
function assignable(db,caller,target){assertRoleExists(db,target);if(target==='owner'&&caller!=='owner')throw forbidden('Only an owner can assign owner');if(caller!=='owner')assertCanModify(db,caller,target);}
export {assignable};
export function registerOrgs(router){
  add(router,'get','/v1/orgs',ctx=>({orgs:organizations(ctx.db,ctx.userId)}));
  add(router,'post','/v1/orgs',ctx=>{
    const name=text(ctx.body.name,'name'),theme=ctx.body.theme===undefined?'cobalt':text(ctx.body.theme,'theme',40),id=newId('org');
    if(ctx.db.prepare('SELECT id FROM organizations WHERE name=? COLLATE NOCASE AND deleted_at IS NULL').get(name))throw conflict('Organization name already exists');
    ctx.db.prepare('INSERT INTO organizations (id,name,theme) VALUES (?,?,?)').run(id,name,theme);
    ctx.db.prepare("INSERT INTO memberships (id,org_id,user_id,role,status,joined_at) VALUES (?,?,?,'owner','active',?)").run(newId('mem'),id,ctx.userId,nowIso());
    ctx.orgId=id;return {id,name,theme,role:'owner'};
  },{write:true,status:201,action:'org.create',targetType:'organization'});
  add(router,'patch','/v1/orgs/:org',ctx=>{
    assertCan(ctx.db,ctx,'org:update');const org=ctx.db.prepare('SELECT * FROM organizations WHERE id=?').get(ctx.orgId);
    const name=ctx.body.name===undefined?org.name:text(ctx.body.name,'name');
    const theme=ctx.body.theme===undefined?org.theme:text(ctx.body.theme,'theme',40);
    const minutes=ctx.body.maxSessionMinutes??org.max_session_minutes;if(!Number.isInteger(minutes)||minutes<1||minutes>1440)throw badRequest('Session duration must be 1–1440 minutes');
    if(ctx.db.prepare('SELECT id FROM organizations WHERE name=? COLLATE NOCASE AND id<>? AND deleted_at IS NULL').get(name,ctx.orgId))throw conflict('Organization name already exists');
    ctx.db.prepare('UPDATE organizations SET name=?,theme=?,max_session_minutes=? WHERE id=?').run(name,theme,minutes,ctx.orgId);return {...org,name,theme,max_session_minutes:minutes};
  },{write:true,action:'org.update',targetType:'organization'});
  add(router,'delete','/v1/orgs/:org',ctx=>{
    assertCan(ctx.db,ctx,'org:delete');endActiveSessions(ctx.db,{orgId:ctx.orgId,reason:'membership_removed'});
    ctx.db.prepare('UPDATE organizations SET deleted_at=? WHERE id=?').run(nowIso(),ctx.orgId);
    ctx.db.prepare("UPDATE memberships SET status='removed',perm_version=perm_version+1 WHERE org_id=?").run(ctx.orgId);
    ctx.db.prepare('UPDATE invites SET revoked_at=? WHERE org_id=? AND accepted_at IS NULL AND revoked_at IS NULL').run(nowIso(),ctx.orgId);
  },{write:true,action:'org.delete',targetType:'organization'});
  add(router,'get','/v1/orgs/:org/members',ctx=>{assertCan(ctx.db,ctx,'user:read');return {members:ctx.db.prepare(`SELECT m.*,u.name,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=? AND m.status<>'removed' ORDER BY u.name`).all(ctx.orgId)};});
  const remove=(ctx,userId)=>{
    const m=member(ctx.db,ctx.orgId,userId);assertNotLastOwner(ctx.db,ctx.orgId,userId);
    if(userId!==ctx.userId){assertCan(ctx.db,ctx,'user:remove');assertCanModify(ctx.db,ctx.role,m.role);}
    ctx.db.prepare("UPDATE memberships SET status='removed',perm_version=perm_version+1 WHERE id=?").run(m.id);
    // Offboarding revokes old overrides so re-invitation cannot resurrect prior authority.
    ctx.db.prepare('UPDATE grants SET revoked_at=? WHERE org_id=? AND user_id=? AND revoked_at IS NULL').run(nowIso(),ctx.orgId,userId);
    endActiveSessions(ctx.db,{orgId:ctx.orgId,userId,reason:'membership_removed'});
  };
  add(router,'delete','/v1/orgs/:org/members/me',ctx=>remove(ctx,ctx.userId),{write:true,action:'member.leave',targetType:'member'});
  add(router,'delete','/v1/orgs/:org/members/:userId',(ctx,p)=>{assertCan(ctx.db,ctx,'user:remove');return remove(ctx,p.userId);},{write:true,action:'member.remove',targetType:'member'});
  add(router,'patch','/v1/orgs/:org/members/:userId',(ctx,p)=>{
    const m=member(ctx.db,ctx.orgId,p.userId);assertCan(ctx.db,ctx,'user:role:update');if(p.userId===ctx.userId)throw selfRoleChange();assertCanModify(ctx.db,ctx.role,m.role);assignable(ctx.db,ctx.role,ctx.body.role);if(ctx.body.role!=='owner')assertNotLastOwner(ctx.db,ctx.orgId,p.userId);
    ctx.db.prepare('UPDATE memberships SET role=?,perm_version=perm_version+1 WHERE id=?').run(ctx.body.role,m.id);return {...m,role:ctx.body.role};
  },{write:true,action:'member.role',targetType:'member'});
  for(const method of ['post','delete'])add(router,method,'/v1/orgs/:org/members/:userId/suspend',(ctx,p)=>{
    const m=member(ctx.db,ctx.orgId,p.userId);assertCan(ctx.db,ctx,'user:remove');assertCanModify(ctx.db,ctx.role,m.role);
    if(method==='post')assertNotLastOwner(ctx.db,ctx.orgId,p.userId);
    const status=method==='post'?'suspended':'active';ctx.db.prepare('UPDATE memberships SET status=?,perm_version=perm_version+1 WHERE id=?').run(status,m.id);
    if(method==='post')endActiveSessions(ctx.db,{orgId:ctx.orgId,userId:p.userId,reason:'user_suspended'});return {status};
  },{write:true,action:method==='post'?'member.suspend':'member.reinstate',targetType:'member'});
  add(router,'get','/v1/orgs/:org/users/:userId/effective',(ctx,p)=>{if(p.userId!==ctx.userId)assertCan(ctx.db,ctx,'user:read');member(ctx.db,ctx.orgId,p.userId);const deviceId=ctx.query.get('deviceId');if(deviceId&&!ctx.db.prepare('SELECT id FROM devices WHERE id=? AND org_id=? AND deleted_at IS NULL').get(deviceId,ctx.orgId))throw notFound();return resolve(ctx.db,{userId:p.userId,orgId:ctx.orgId,deviceId});});
  add(router,'get','/v1/orgs/:org/audit',ctx=>{assertCan(ctx.db,ctx,'audit:read');const {limit,offset}=pagination(ctx.query);return {events:ctx.db.prepare('SELECT * FROM audit_events WHERE org_id=? ORDER BY at DESC,id DESC LIMIT ? OFFSET ?').all(ctx.orgId,limit,offset)};});
}
