import { add, text, email } from './shared.js';
import { assertCan } from '../permissions.js';
import { assignable } from './orgs.js';
import { newInviteToken, hashInviteToken, hashPassword, verifyPassword } from '../auth.js';
import { newId, nowIso } from '../db.js';
import { profile, issueRefresh } from './auth.js';
import { notFound, gone, conflict, badRequest, unauthenticated } from '../http.js';
function lookup(db,raw){const invite=db.prepare(`SELECT i.*,o.name org_name FROM invites i JOIN organizations o ON o.id=i.org_id WHERE i.token_hash=? AND o.deleted_at IS NULL`).get(hashInviteToken(raw));if(!invite)throw notFound();if(invite.accepted_at)throw conflict('Invitation already accepted');if(invite.revoked_at||invite.expires_at<=nowIso())throw gone();return invite;}
export function registerInvites(router){
  add(router,'get','/v1/orgs/:org/invites',ctx=>{assertCan(ctx.db,ctx,'user:invite');return {invites:ctx.db.prepare('SELECT id,email,role,expires_at,created_at FROM invites WHERE org_id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>? ORDER BY created_at DESC').all(ctx.orgId,nowIso())};});
  add(router,'post','/v1/orgs/:org/invites',ctx=>{
    assertCan(ctx.db,ctx,'user:invite');const address=email(ctx.body.email);assignable(ctx.db,ctx.role,ctx.body.role);
    const m=ctx.db.prepare('SELECT m.status FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=? AND u.email=?').get(ctx.orgId,address);if(m&&m.status!=='removed')throw conflict('Membership or invitation already exists');
    // Expired pending rows still occupy the schema's partial unique index; retire them first.
    ctx.db.prepare('UPDATE invites SET revoked_at=? WHERE org_id=? AND email=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at<=?').run(nowIso(),ctx.orgId,address,nowIso());
    const id=newId('inv'),raw=newInviteToken(),expiresAt=new Date(Date.now()+7*86400000).toISOString();
    ctx.db.prepare('INSERT INTO invites (id,org_id,email,role,token_hash,invited_by,expires_at) VALUES (?,?,?,?,?,?,?)').run(id,ctx.orgId,address,ctx.body.role,hashInviteToken(raw),ctx.userId,expiresAt);
    return {id,email:address,role:ctx.body.role,expiresAt,inviteToken:raw};
  },{write:true,status:201,action:'invite.create',targetType:'invite'});
  add(router,'delete','/v1/orgs/:org/invites/:id',(ctx,p)=>{assertCan(ctx.db,ctx,'user:invite');if(!ctx.db.prepare('UPDATE invites SET revoked_at=? WHERE id=? AND org_id=? AND accepted_at IS NULL AND revoked_at IS NULL').run(nowIso(),p.id,ctx.orgId).changes)throw notFound();},{write:true,action:'invite.revoke',targetType:'invite'});
  add(router,'get','/v1/invites/:token',(ctx,p,res)=>{res.setHeader('Referrer-Policy','no-referrer');const i=lookup(ctx.db,p.token);return {orgName:i.org_name,role:i.role,email:i.email,expiresAt:i.expires_at};});
  add(router,'post','/v1/invites/:token/accept',(ctx,p,res)=>{
    const i=lookup(ctx.db,p.token),name=text(ctx.body.name,'name'),password=text(ctx.body.password,'password',1024);if(password.length<8)throw badRequest('Password must contain at least 8 characters');
    let user=ctx.db.prepare('SELECT * FROM users WHERE email=?').get(i.email);
    if(user){if(!verifyPassword(password,user.password_hash))throw unauthenticated('Enter your existing account password to accept this invitation');}
    else{user={id:newId('usr')};ctx.db.prepare('INSERT INTO users (id,email,name,password_hash) VALUES (?,?,?,?)').run(user.id,i.email,name,hashPassword(password));}
    const old=ctx.db.prepare('SELECT * FROM memberships WHERE org_id=? AND user_id=?').get(i.org_id,user.id);if(old&&old.status!=='removed'&&old.status!=='invited')throw conflict('Membership already exists');
    ctx.db.prepare(`INSERT INTO memberships (id,org_id,user_id,role,status,invited_by,joined_at) VALUES (?,?,?,?,'active',?,?) ON CONFLICT(org_id,user_id) DO UPDATE SET role=excluded.role,status='active',joined_at=excluded.joined_at,perm_version=memberships.perm_version+1`).run(newId('mem'),i.org_id,user.id,i.role,i.invited_by,nowIso());
    if(!ctx.db.prepare('UPDATE invites SET accepted_at=?,accepted_by=? WHERE id=? AND accepted_at IS NULL AND revoked_at IS NULL').run(nowIso(),user.id,i.id).changes)throw conflict('Invitation already accepted');
    ctx.orgId=i.org_id;ctx.userId=user.id;issueRefresh(ctx.db,res,user.id);return profile(ctx.db,ctx.secret,user.id,i.org_id);
  },{write:true,action:'invite.accept',targetType:'invite'});
}
