// Development response fixtures, NOT a role/permission resolution implementation.
import { ApiError } from './http';
const keys = ['device:list','device:view','device:control','device:terminal','device:file_transfer','device:provision','device:update','session:start','session:view','session:terminate','user:read','user:invite','user:role:update','user:remove','grant:create','grant:revoke','audit:read','org:update','org:delete'];
const allowed = Object.fromEntries(keys.map(key => [key, { effect: 'allow', source: 'fixture:preview', reason: null }]));
const denied = { effect: 'deny', source: 'fixture:preview', reason: 'explicit_deny' };
export function createMockApi() {
  let active = 'preview_north';
  const orgs = [{ id: active, name: 'Northstar Studio', theme: 'cobalt', role: 'owner' }, { id: 'preview_south', name: 'Field Operations', theme: 'forest', role: 'reviewer' }];
  const devices = [{ id: 'preview_mac', name: 'design-studio-01', kind: 'macos', online: true, permissions: structuredClone(allowed) }, { id: 'preview_linux', name: 'build-runner-02', kind: 'linux', online: true, permissions: { ...allowed, 'device:terminal': denied } }, { id: 'preview_win', name: 'reception-03', kind: 'windows', online: false, permissions: { ...allowed, 'device:control': denied } }];
  const members = [{ user_id: 'preview_me', id: 'preview_me', name: 'Priyansh Jha', email: 'preview@example.test', role: 'owner', status: 'active' }, { user_id: 'preview_colleague', id: 'preview_colleague', name: 'Alex Morgan', email: 'alex@example.test', role: 'operator', status: 'active' }];
  const grants = [], sessions = [], invites = [];
  const me = () => ({ token: 'mock-memory-only', user: members[0], orgId: active, org: orgs.find(o => o.id === active), orgs, role: orgs.find(o => o.id === active).role, permissions: active === 'preview_north' ? allowed : { ...allowed, 'org:delete': denied, 'device:control': denied } });
  const id = () => `preview_${crypto.randomUUID().slice(0,8)}`;
  return {
    async login(body) { if (!body.email || body.password !== 'demo1234') throw new ApiError({ code:'UNAUTHENTICATED', message:'Invalid email or password' },401); return me(); },
    async restore() { throw new ApiError({ code:'UNAUTHENTICATED', message:'Please sign in' },401); },
    async switchOrg(orgId) { active = orgId; return me(); }, async logout() {},
    async request(method, path, body = {}) {
      await new Promise(r => setTimeout(r, 100));
      const parts = path.split('/'), resource = parts[3], target = parts[4];
      if (path === '/auth/me') return me();
      if (path === '/catalogue') return { roles: ['owner','admin','operator','auditor','viewer','reviewer'].map(key=>({key,label:key})), permissions: keys.map(key=>({key})), patterns: [...keys,'device:*','*'] };
      if (path === '/orgs' && method === 'POST') { const o = {id:id(),theme:'forest',role:'owner',...body}; orgs.push(o); return o; }
      if (path === '/orgs') return { orgs };
      if (resource === 'devices') {
        if (method === 'POST' && !target) { const d = {id:id(),online:false,permissions:structuredClone(allowed),...body}; devices.push(d); return d; }
        if (method === 'PATCH') Object.assign(devices.find(d=>d.id===target),body);
        if (method === 'DELETE') devices.splice(devices.findIndex(d=>d.id===target),1);
        return { devices: active === 'preview_north' ? devices : [] };
      }
      if (resource === 'members') { const m = members.find(m=>m.user_id===target); if (m && method==='PATCH') Object.assign(m,body); if (m && parts[5]==='suspend') m.status=method==='POST'?'suspended':'active'; if (m && method==='DELETE' && !parts[5]) members.splice(members.indexOf(m),1); return {members}; }
      if (resource === 'grants') { if(method==='POST') grants.push({id:id(),user_id:body.userId,device_id:body.deviceId,...body}); if(method==='DELETE') grants.splice(grants.findIndex(g=>g.id===target),1); return {grants}; }
      if (resource === 'invites') { if(method==='POST') {const i={id:id(),...body};invites.push(i);return {...i,inviteToken:'preview-credential'};} if(method==='DELETE') invites.splice(invites.findIndex(i=>i.id===target),1);return {invites}; }
      if (resource === 'sessions') { if(method==='POST') sessions.push({id:id(),user_id:'preview_me',device_id:body.deviceId,mode:body.mode,state:'active',expires_at:new Date(Date.now()+3600000).toISOString()});return {sessions}; }
      if (parts[1]==='sessions') { const s=sessions.find(s=>s.id===parts[2]);if(method==='DELETE')s.state='ended';return s; }
      if (resource === 'audit') return {events:[{id:'preview_event',action:'device.provision',actor_id:'preview_me',target_id:'preview_mac',result:'allow',at:new Date().toISOString()}]};
      if (resource === 'users') return { role:'operator',permissions:allowed };
      if (parts[1]==='orgs' && method==='PATCH') {Object.assign(orgs.find(o=>o.id===active),body);return me().org;}
      if (parts[1]==='orgs' && method==='DELETE') {orgs.splice(orgs.findIndex(o=>o.id===active),1);return {ok:true};}
      throw new ApiError({code:'MOCK_UNSUPPORTED',message:'This request needs the real backend.'});
    }
  };
}
