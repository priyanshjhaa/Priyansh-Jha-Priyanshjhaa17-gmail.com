import { newId } from './db.js';
export function audit(db,{orgId,actorId=null,action,targetType=null,targetId=null,result,reasonCode=null,requestId=null}) {
  if(!orgId)return;
  db.prepare(`INSERT INTO audit_events (id,org_id,actor_id,action,target_type,target_id,result,reason_code,request_id) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(newId('evt'),orgId,actorId,action,targetType,targetId,result,reasonCode,requestId);
}
export function auditDenials(db,ctx,meta,fn) {
  try{return fn();}catch(error){if(error.status===403)audit(db,{orgId:ctx.orgId,actorId:ctx.userId,requestId:ctx.requestId,...meta,result:'deny',reasonCode:error.reason||error.code});throw error;}
}
