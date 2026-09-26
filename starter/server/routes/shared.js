import { send, badRequest, notFound, conflict } from '../http.js';
import { audit } from '../audit.js';

export function text(value,name,max=120) {if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw badRequest(`${name} must contain 1–${max} characters`);return value.trim();}
export function email(value){const s=text(value,'email',254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))throw badRequest('Invalid email address');return s;}
export function member(db,orgId,userId){if(typeof userId!=='string')throw badRequest('userId is required');const m=db.prepare("SELECT * FROM memberships WHERE org_id=? AND user_id=? AND status<>'removed'").get(orgId,userId);if(!m)throw notFound();return m;}
export function device(db,orgId,id){if(typeof id!=='string')throw badRequest('deviceId is required');const d=db.prepare('SELECT * FROM devices WHERE org_id=? AND id=? AND deleted_at IS NULL').get(orgId,id);if(!d)throw notFound();return d;}
export function pagination(query){const number=(key,def,max)=>{if(!query.has(key))return def;const raw=query.get(key);if(!/^\d+$/.test(raw))throw badRequest(`Invalid ${key}`);const n=Number(raw);if(!Number.isSafeInteger(n)||n>(max??Number.MAX_SAFE_INTEGER)||n<(key==='limit'?1:0))throw badRequest(`Invalid ${key}`);return n;};return {limit:number('limit',100,500),offset:number('offset',0)};}
export function add(router,method,path,fn,{write=false,status=200,action=path,targetType=null}={}) {
  router[method](path,(ctx,params,res)=>{
    try{
      const execute=()=>{
        const data=fn(ctx,params,res);
        if(write)audit(ctx.db,{orgId:ctx.orgId,actorId:ctx.userId,action,targetType,targetId:params.id||params.userId||data?.id||null,result:'allow',requestId:ctx.requestId});
        return data;
      };
      const data=write?ctx.db.transaction(execute).immediate():execute();
      send(res,status,data??{ok:true});
    }catch(error){
      if(error.status===403||error.status===409)audit(ctx.db,{orgId:ctx.orgId,actorId:ctx.userId,action,targetType,targetId:params.id||params.userId||null,result:'deny',reasonCode:error.reason||error.code,requestId:ctx.requestId});
      if(error.code?.startsWith('SQLITE_CONSTRAINT'))throw error.code.includes('UNIQUE')?conflict('A conflicting record already exists'):badRequest('Invalid record or reference');
      throw error;
    }
  });
}
