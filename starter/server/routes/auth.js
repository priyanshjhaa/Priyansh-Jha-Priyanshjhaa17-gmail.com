import { issueAccessToken, newRefreshToken, hashRefreshToken, verifyPassword, REFRESH_TTL_SECONDS } from '../auth.js';
import { newId, nowIso } from '../db.js';
import { resolve } from '../permissions.js';
import { unauthenticated, forbidden, notFound, badRequest } from '../http.js';
import { add, email } from './shared.js';

export function organizations(db,userId){return db.prepare(`SELECT o.*,m.role FROM organizations o JOIN memberships m ON m.org_id=o.id WHERE m.user_id=? AND m.status='active' AND o.deleted_at IS NULL ORDER BY o.created_at,o.id`).all(userId);}
export function profile(db,secret,userId,orgId){
  const orgs=organizations(db,userId),org=orgId?orgs.find(o=>o.id===orgId):orgs[0];
  if(!org)throw unauthenticated('No active membership for this organization');
  const m=db.prepare('SELECT * FROM memberships WHERE user_id=? AND org_id=?').get(userId,org.id);
  const user=db.prepare('SELECT id,name,email FROM users WHERE id=?').get(userId);
  return {token:issueAccessToken({userId,orgId:org.id,role:m.role,permVersion:m.perm_version},secret),user,org,orgId:org.id,orgs,role:m.role,permissions:resolve(db,{userId,orgId:org.id}).permissions};
}
function setCookie(res,raw,maxAge=REFRESH_TTL_SECONDS){res.setHeader('set-cookie',`rt=${raw}; HttpOnly; SameSite=Strict; Secure; Path=/v1/auth; Max-Age=${maxAge}`);}
export function issueRefresh(db,res,userId,familyId=newId('family')){
  const raw=newRefreshToken();db.prepare('INSERT INTO refresh_tokens (id,user_id,token_hash,family_id,expires_at) VALUES (?,?,?,?,?)').run(newId('rt'),userId,hashRefreshToken(raw),familyId,new Date(Date.now()+REFRESH_TTL_SECONDS*1000).toISOString());setCookie(res,raw);
}
function cookie(req){const match=/(?:^|;\s*)rt=([^;]+)/.exec(req.headers.cookie||'');return match?.[1];}
export function registerAuth(router){
  add(router,'post','/v1/auth/login',(ctx,p,res)=>{
    const address=email(ctx.body.email);if(typeof ctx.body.password!=='string'||!ctx.body.password)throw badRequest('Email and password are required');
    const user=ctx.db.prepare('SELECT * FROM users WHERE email=?').get(address);
    if(!user||!verifyPassword(ctx.body.password,user.password_hash))throw unauthenticated('Invalid email or password');
    const requested=ctx.body.orgId;if(requested!==undefined&&typeof requested!=='string')throw badRequest('Invalid orgId');
    const data=profile(ctx.db,ctx.secret,user.id,requested);ctx.db.transaction(()=>issueRefresh(ctx.db,res,user.id)).immediate();return data;
  });
  add(router,'post','/v1/auth/refresh',(ctx,p,res)=>{
    const raw=cookie(ctx.req);if(!raw||!/^[A-Za-z0-9_-]{43}$/.test(raw))throw unauthenticated();
    // Return the failure from the transaction rather than throwing, so replay revocation commits.
    const result=ctx.db.transaction(()=>{
      const row=ctx.db.prepare('SELECT * FROM refresh_tokens WHERE token_hash=?').get(hashRefreshToken(raw));
      if(!row)return {error:unauthenticated()};
      if(row.revoked_at){ctx.db.prepare('UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at,?) WHERE family_id=?').run(nowIso(),row.family_id);return {error:unauthenticated('Refresh credential was reused; sign in again')};}
      if(row.expires_at<=nowIso())return {error:unauthenticated('Refresh credential expired')};
      if(ctx.body.orgId!==undefined&&typeof ctx.body.orgId!=='string')return {error:badRequest('Invalid orgId')};
      let data;try{data=profile(ctx.db,ctx.secret,row.user_id,ctx.body.orgId);}catch(error){return {error};}
      ctx.db.prepare('UPDATE refresh_tokens SET revoked_at=? WHERE id=?').run(nowIso(),row.id);issueRefresh(ctx.db,res,row.user_id,row.family_id);return {data};
    }).immediate();
    if(result.error){setCookie(res,'',0);throw result.error;}return result.data;
  });
  add(router,'post','/v1/auth/token',ctx=>{if(typeof ctx.body.orgId!=='string')throw badRequest('orgId is required');if(!organizations(ctx.db,ctx.userId).some(o=>o.id===ctx.body.orgId))throw notFound();return profile(ctx.db,ctx.secret,ctx.userId,ctx.body.orgId);});
  add(router,'get','/v1/auth/me',ctx=>profile(ctx.db,ctx.secret,ctx.userId,ctx.orgId));
  add(router,'post','/v1/auth/logout',(ctx,p,res)=>{const raw=cookie(ctx.req);if(raw){const row=ctx.db.prepare('SELECT * FROM refresh_tokens WHERE token_hash=?').get(hashRefreshToken(raw));if(row)ctx.db.prepare('UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at,?) WHERE family_id=?').run(nowIso(),row.family_id);}setCookie(res,'',0);return {ok:true};});
  add(router,'get','/v1/catalogue',ctx=>({roles:ctx.db.prepare('SELECT key,rank,label FROM roles ORDER BY rank DESC').all(),permissions:ctx.db.prepare('SELECT * FROM permissions ORDER BY key').all(),patterns:ctx.db.prepare('SELECT pattern FROM permission_patterns ORDER BY pattern').all().map(r=>r.pattern)}));
}
