import { add, device } from './shared.js';
import { assertCan, can, assertCanStartSession } from '../permissions.js';
import { snapshotAuthority, sessionExpiry, expireSessions } from '../lifecycle.js';
import { newId, nowIso } from '../db.js';
import { notFound, deviceBusy } from '../http.js';
function session(ctx,id){const s=ctx.db.prepare('SELECT * FROM sessions WHERE id=? AND org_id=?').get(id,ctx.orgId);if(!s)throw notFound();return s;}
export function registerSessions(router){
  add(router,'post','/v1/orgs/:org/sessions',ctx=>{
    expireSessions(ctx.db);const d=device(ctx.db,ctx.orgId,ctx.body.deviceId);if(!can(ctx.db,ctx,'device:view',d.id))throw notFound();assertCanStartSession(ctx.db,ctx,ctx.body.mode,d.id);
    const id=newId('ses'),expiry=sessionExpiry(ctx.db,ctx.orgId),snapshot=snapshotAuthority(ctx.db,{userId:ctx.userId,orgId:ctx.orgId,deviceId:d.id});
    try{ctx.db.prepare("INSERT INTO sessions (id,org_id,user_id,device_id,mode,state,authorized_by,expires_at) VALUES (?,?,?,?,?,'active',?,?)").run(id,ctx.orgId,ctx.userId,d.id,ctx.body.mode,snapshot,expiry);}catch(e){if(e.code==='SQLITE_CONSTRAINT_UNIQUE'){const holder=ctx.db.prepare("SELECT id FROM sessions WHERE device_id=? AND state='active' AND mode IN ('control','terminal')").get(d.id);throw deviceBusy(`Device held by session ${holder?.id}`);}throw e;}
    return session(ctx,id);
  },{write:true,status:201,action:'session.start',targetType:'session'});
  add(router,'get','/v1/orgs/:org/sessions',ctx=>{expireSessions(ctx.db);assertCan(ctx.db,ctx,'session:view');return {sessions:ctx.db.prepare('SELECT * FROM sessions WHERE org_id=? ORDER BY started_at DESC,id').all(ctx.orgId)};});
  add(router,'get','/v1/sessions/:id',(ctx,p)=>{expireSessions(ctx.db);const s=session(ctx,p.id);if(s.user_id!==ctx.userId)assertCan(ctx.db,ctx,'session:view');return s;});
  add(router,'delete','/v1/sessions/:id',(ctx,p)=>{expireSessions(ctx.db);const s=session(ctx,p.id);if(s.user_id!==ctx.userId)assertCan(ctx.db,ctx,'session:terminate');if(s.state==='ended')return s;const reason=s.user_id===ctx.userId?'user_stopped':'admin_terminated';ctx.db.prepare("UPDATE sessions SET state='ended',end_reason=?,ended_at=? WHERE id=?").run(reason,nowIso(),s.id);return session(ctx,p.id);},{write:true,action:'session.stop',targetType:'session'});
}
