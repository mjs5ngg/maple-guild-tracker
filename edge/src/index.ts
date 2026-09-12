// Cloudflare Workers에서 익명 설정·Google 로그인·공개 순위와 서명 수집 API를 제공합니다.
import {sha256,signatureMatches,timestampMilliseconds} from "./security";
import {FAVORITE_LIMIT,type IngestBody,validIngest,validProfile} from "./validation";

interface Env{
 DB:D1Database;
 ASSETS:Fetcher;
 GOOGLE_CLIENT_ID?:string;
 GOOGLE_CLIENT_SECRET?:string;
 INGEST_HMAC_SECRET?:string;
}
type Row=Record<string,unknown>;

class ApiError extends Error{constructor(readonly status:number,message:string){super(message);}}
const nowSeconds=()=>Math.floor(Date.now()/1000);
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json; charset=utf-8"}});
const randomToken=()=>crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-","");
function cookies(request:Request){
 const result:Record<string,string>={};
 for(const part of (request.headers.get("cookie")||"").split(";")){
  const [name,...rest]=part.trim().split("="); if(name&&rest.length)result[name]=rest.join("=");
 }
 return result;
}
function sessionCookie(request:Request,name:string,value:string,maxAge:number){return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(request.url).protocol==="https:"?"; Secure":""}`;}
function addSecurity(response:Response,api=false){
 const headers=new Headers(response.headers);
 headers.set("x-content-type-options","nosniff"); headers.set("referrer-policy","no-referrer");
 headers.set("content-security-policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://open.api.nexon.com data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
 if(api)headers.set("cache-control","no-store");
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
function kstDate(date=new Date()){return new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);}
function addDays(date:string,days:number){const value=new Date(`${date}T00:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}

async function userId(request:Request,env:Env){
 const values=cookies(request);
 for(const [name,kind] of [["maple_session","account"],["maple_device","device"]] as const){
  const token=values[name]; if(!token)continue;
  const row=await env.DB.prepare("SELECT user_id FROM sessions WHERE token_hash=? AND kind=? AND expires_at>?").bind(await sha256(token),kind,nowSeconds()).first<{user_id:string}>();
  if(row)return row.user_id;
 }
 throw new ApiError(401,"기기 설정을 먼저 시작해 주세요.");
}
async function takeBudget(env:Env,bucket:string,limit:number){
 const now=nowSeconds(),row=await env.DB.prepare("SELECT started_at,used FROM request_budgets WHERE bucket=?").bind(bucket).first<{started_at:number;used:number}>();
 if(row&&now-row.started_at<3600&&row.used>=limit)throw new ApiError(429,"잠시 후 다시 시도해 주세요.");
 if(!row||now-row.started_at>=3600)await env.DB.prepare("INSERT INTO request_budgets(bucket,started_at,used) VALUES(?,?,1) ON CONFLICT(bucket) DO UPDATE SET started_at=excluded.started_at,used=1").bind(bucket,now).run();
 else await env.DB.prepare("UPDATE request_budgets SET used=used+1 WHERE bucket=?").bind(bucket).run();
}
async function bodyJson(request:Request){try{return await request.json();}catch{throw new ApiError(400,"요청 내용을 확인하세요.");}}
function basic(row:Row){return {character_name:row.name,world_name:row.world_name,character_class:row.character_class,character_level:row.level,character_exp:String(row.exp),character_exp_rate:String(row.exp_rate),character_guild_name:row.guild_name,character_image:row.image_url};}

async function device(request:Request,env:Env){
 try{return json({ok:true,userId:await userId(request,env)});}catch(error){if(!(error instanceof ApiError)||error.status!==401)throw error;}
 const ip=request.headers.get("cf-connecting-ip")||"unknown"; await takeBudget(env,`new-device:${ip}`,100);
 const id=crypto.randomUUID(),token=randomToken(),now=nowSeconds();
 await env.DB.batch([
  env.DB.prepare("INSERT INTO users(id,last_active) VALUES(?,?)").bind(id,now),
  env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,kind) VALUES(?,?,?,'device')").bind(await sha256(token),id,now+30*86400)
 ]);
 const response=json({ok:true}); response.headers.append("set-cookie",sessionCookie(request,"maple_device",token,30*86400)); return response;
}
async function me(request:Request,env:Env){
 const id=await userId(request,env),user=await env.DB.prepare("SELECT primary_name FROM users WHERE id=?").bind(id).first<{primary_name:string}>();
 const favorites=await env.DB.prepare("SELECT name FROM favorites WHERE user_id=? ORDER BY name").bind(id).all<{name:string}>();
 return json({primary:user?.primary_name||"",favorites:favorites.results.map(row=>row.name),signedIn:Boolean(cookies(request).maple_session)});
}
async function profile(request:Request,env:Env){
 const id=await userId(request,env),input=await bodyJson(request); if(!validProfile(input))throw new ApiError(400,"대표캐릭터와 즐겨찾기 30명 이내의 닉네임을 확인하세요.");
 await takeBudget(env,`profile:${id}`,10);
 const statements=[env.DB.prepare("UPDATE users SET primary_name=?,last_active=? WHERE id=?").bind(input.primary,nowSeconds(),id),env.DB.prepare("DELETE FROM favorites WHERE user_id=?").bind(id)];
 for(const name of [...input.favorites].sort())statements.push(env.DB.prepare("INSERT INTO favorites(user_id,name) VALUES(?,?)").bind(id,name));
 await env.DB.batch(statements); return json({ok:true});
}
async function activity(request:Request,env:Env){const id=await userId(request,env);await env.DB.prepare("UPDATE users SET last_active=? WHERE id=?").bind(nowSeconds(),id).run();return json({ok:true});}

async function dashboard(request:Request,env:Env){
 const id=await userId(request,env),today=kstDate(),start=addDays(today,-30),yesterday=addDays(today,-1);
 const rows=await env.DB.prepare(`SELECT DISTINCT c.* FROM characters c WHERE c.name=(SELECT primary_name FROM users WHERE id=?) OR c.name IN (SELECT name FROM favorites WHERE user_id=?) OR c.name IN (SELECT gm.name FROM guild_members gm WHERE gm.guild_key=(SELECT p.guild_key FROM characters p WHERE p.name=(SELECT primary_name FROM users WHERE id=?))) ORDER BY c.level DESC,length(c.exp) DESC,c.exp DESC,c.name`).bind(id,id,id).all<Row>();
 const ocids=rows.results.map(row=>String(row.ocid));
 let histories:Row[]=[],baselines:Row[]=[];
 if(ocids.length){
  const placeholders=ocids.map(()=>"?").join(",");
  histories=(await env.DB.prepare(`SELECT * FROM daily_snapshots WHERE ocid IN (${placeholders}) AND date>=? AND date<=? ORDER BY ocid,date`).bind(...ocids,start,today).all<Row>()).results;
  baselines=(await env.DB.prepare(`SELECT * FROM today_baselines WHERE ocid IN (${placeholders}) AND date=?`).bind(...ocids,today).all<Row>()).results;
 }
 const historyBy=new Map<string,Row[]>(),baselineBy=new Map(baselines.map(row=>[String(row.ocid),row]));
 for(const row of histories){const key=String(row.ocid),list=historyBy.get(key)||[];list.push(row);historyBy.set(key,list);}
 const primary=await env.DB.prepare("SELECT c.guild_key FROM characters c JOIN users u ON u.primary_name=c.name WHERE u.id=?").bind(id).first<{guild_key:string|null}>();
 const currentMembers=new Set<string>(),dailyMembers=new Set<string>();
 if(primary?.guild_key){
  for(const row of (await env.DB.prepare("SELECT name FROM guild_members WHERE guild_key=?").bind(primary.guild_key).all<{name:string}>()).results)currentMembers.add(row.name);
  for(const row of (await env.DB.prepare("SELECT date,name FROM guild_daily_members WHERE guild_key=? AND date>=? AND date<=?").bind(primary.guild_key,start,today).all<{date:string;name:string}>()).results)dailyMembers.add(`${row.date}\0${row.name}`);
 }
 const characters=rows.results.map(row=>{
  const ocid=String(row.ocid),historyRows=historyBy.get(ocid)||[],membership:Record<string,boolean>={[today]:currentMembers.has(String(row.name))};
  for(const snapshot of historyRows)membership[String(snapshot.date)]=dailyMembers.has(`${snapshot.date}\0${snapshot.name}`);
  return {ocid,basic:basic(row),observedAt:row.observed_at,history:historyRows.map(snapshot=>({date:snapshot.date,basic:basic(snapshot)})),todayBaseline:baselineBy.has(ocid)?basic(baselineBy.get(ocid)!):null,estimated:!historyRows.some(snapshot=>snapshot.date===yesterday),isGuildMember:currentMembers.has(String(row.name)),guildMembership:primary?.guild_key?membership:null};
 });
 const sync=await env.DB.prepare("SELECT status,started_at AS startedAt,finished_at AS finishedAt,succeeded,failed FROM sync_state WHERE id=1").first();
 return json({characters,sync,today});
}

async function googleStart(request:Request,env:Env){
 if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET)throw new ApiError(503,"Google 로그인이 아직 설정되지 않았습니다.");
 let linkUser:string|null=null; try{linkUser=await userId(request,env);}catch{/* 새 계정으로 계속합니다. */}
 const state=randomToken(),browser=randomToken(),expires=nowSeconds()+600,origin=new URL(request.url).origin;
 await env.DB.prepare("INSERT INTO login_attempts(state_hash,browser_hash,expires_at,link_user) VALUES(?,?,?,?)").bind(await sha256(state),await sha256(browser),expires,linkUser).run();
 const url=new URL("https://accounts.google.com/o/oauth2/v2/auth");
 url.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,response_type:"code",redirect_uri:`${origin}/auth/google/callback`,scope:"openid",state}).toString();
 return new Response(null,{status:302,headers:{location:url.toString(),"set-cookie":sessionCookie(request,"maple_login",browser,600)}});
}
async function googleCallback(request:Request,env:Env){
 if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET)throw new ApiError(503,"Google 로그인이 아직 설정되지 않았습니다.");
 const url=new URL(request.url),code=url.searchParams.get("code"),state=url.searchParams.get("state"),browser=cookies(request).maple_login;
 if(!code||!state||!browser)throw new ApiError(400,"로그인을 확인하지 못했습니다. 다시 시도해 주세요.");
 const attempt=await env.DB.prepare("DELETE FROM login_attempts WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING link_user").bind(await sha256(state),await sha256(browser),nowSeconds()).first<{link_user:string|null}>();
 if(!attempt)throw new ApiError(400,"로그인을 확인하지 못했습니다. 다시 시도해 주세요.");
 const origin=url.origin,tokenResponse=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,code,redirect_uri:`${origin}/auth/google/callback`})});
 if(!tokenResponse.ok)throw new ApiError(400,"Google 로그인을 확인하지 못했습니다.");
 const token=await tokenResponse.json<{access_token?:string}>(); if(!token.access_token)throw new ApiError(400,"Google 로그인을 확인하지 못했습니다.");
 const profileResponse=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{authorization:`Bearer ${token.access_token}`}});if(!profileResponse.ok)throw new ApiError(400,"Google 계정을 확인하지 못했습니다.");
 const google=await profileResponse.json<{sub?:string}>();if(!google.sub)throw new ApiError(400,"Google 계정을 확인하지 못했습니다.");
 const existing=await env.DB.prepare("SELECT user_id FROM identities WHERE provider='google' AND subject=?").bind(google.sub).first<{user_id:string}>();
 const id=existing?.user_id||attempt.link_user||crypto.randomUUID(),session=randomToken(),now=nowSeconds(),statements:D1PreparedStatement[]=[];
 if(!existing&&!attempt.link_user)statements.push(env.DB.prepare("INSERT INTO users(id,last_active) VALUES(?,?)").bind(id,now));
 if(!existing)statements.push(env.DB.prepare("INSERT INTO identities(provider,subject,user_id) VALUES('google',?,?)").bind(google.sub,id));
 statements.push(env.DB.prepare("UPDATE users SET last_active=? WHERE id=?").bind(now,id),env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,kind) VALUES(?,?,?,'account')").bind(await sha256(session),id,now+30*86400));
 await env.DB.batch(statements);
 const headers=new Headers({location:`${origin}/`});headers.append("set-cookie",sessionCookie(request,"maple_session",session,30*86400));headers.append("set-cookie",sessionCookie(request,"maple_login","",0));return new Response(null,{status:302,headers});
}
async function logout(request:Request,env:Env){const token=cookies(request).maple_session;if(token)await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run();const response=json({ok:true});response.headers.append("set-cookie",sessionCookie(request,"maple_session","",0));return response;}
async function deleteAccount(request:Request,env:Env){
 if(!cookies(request).maple_session)throw new ApiError(401,"계정 탈퇴는 로그인 후 가능합니다.");
 const id=await userId(request,env),input=await bodyJson(request) as {confirmation?:unknown};if(input.confirmation!=="탈퇴")throw new ApiError(400,"탈퇴 확인 문구를 입력하세요.");
 await env.DB.prepare("DELETE FROM users WHERE id=?").bind(id).run();const response=json({ok:true});response.headers.append("set-cookie",sessionCookie(request,"maple_session","",0));return response;
}

async function internalAuth(request:Request,env:Env,body:string){
 if(!env.INGEST_HMAC_SECRET)throw new ApiError(503,"내부 수집 인증이 설정되지 않았습니다.");
 const timestamp=request.headers.get("x-maple-timestamp")||"",batch=request.headers.get("x-maple-batch-id")||"",signature=request.headers.get("x-maple-signature")||"";
 if(!(await signatureMatches(env.INGEST_HMAC_SECRET,timestamp,batch,body,signature)))throw new ApiError(401,"수집 요청 서명이 올바르지 않습니다.");
 return {timestamp,batch};
}
async function subscriptions(request:Request,env:Env){
 await internalAuth(request,env,"");
 const active=nowSeconds()-168*3600;
 const rows=await env.DB.prepare(`WITH active AS (SELECT id,primary_name FROM users WHERE last_active>=?), targets AS (SELECT primary_name AS name FROM active WHERE primary_name<>'' UNION SELECT f.name FROM favorites f JOIN active a ON a.id=f.user_id UNION SELECT gm.name FROM active a JOIN characters p ON p.name=a.primary_name JOIN guild_members gm ON gm.guild_key=p.guild_key) SELECT name FROM targets ORDER BY name`).bind(active).all<{name:string}>();
 return json({activeSince:new Date(active*1000).toISOString(),targets:rows.results.map(row=>row.name)});
}
async function ingest(request:Request,env:Env){
 const raw=await request.text(),auth=await internalAuth(request,env,raw),parsed:unknown=(()=>{try{return JSON.parse(raw);}catch{return null;}})();
 if(!validIngest(parsed)||parsed.batchId!==auth.batch||Math.abs(Date.parse(parsed.sentAt)-timestampMilliseconds(auth.timestamp))>1000)throw new ApiError(400,"정규화 수집 본문을 확인하세요.");
 if(await env.DB.prepare("SELECT 1 FROM ingest_batches WHERE batch_id=?").bind(auth.batch).first())throw new ApiError(409,"이미 처리한 수집 배치입니다.");
 const body=parsed as IngestBody,now=nowSeconds(),guildMembers=body.guilds.flatMap(guild=>guild.members.map(name=>({guildKey:guild.guildKey,name}))),dailyMembers=body.guilds.flatMap(guild=>(guild.daily||[]).flatMap(day=>day.members.map(name=>({guildKey:guild.guildKey,date:day.date,name}))));
 const statements:D1PreparedStatement[]=[env.DB.prepare("INSERT INTO ingest_batches(batch_id,sent_at,accepted_at) VALUES(?,?,?)").bind(auth.batch,Math.floor(Date.parse(body.sentAt)/1000),now)];
 if(body.current.length)statements.push(env.DB.prepare(`INSERT INTO characters SELECT json_extract(value,'$.ocid'),json_extract(value,'$.name'),json_extract(value,'$.worldName'),json_extract(value,'$.characterClass'),json_extract(value,'$.level'),CAST(json_extract(value,'$.exp') AS TEXT),json_extract(value,'$.expRate'),json_extract(value,'$.guildName'),json_extract(value,'$.guildKey'),json_extract(value,'$.imageUrl'),json_extract(value,'$.observedAt') FROM json_each(?) WHERE true ON CONFLICT(ocid) DO UPDATE SET name=excluded.name,world_name=excluded.world_name,character_class=excluded.character_class,level=excluded.level,exp=excluded.exp,exp_rate=excluded.exp_rate,guild_name=excluded.guild_name,guild_key=excluded.guild_key,image_url=excluded.image_url,observed_at=excluded.observed_at WHERE excluded.observed_at>=characters.observed_at`).bind(JSON.stringify(body.current)));
 if(body.dailySnapshots.length)statements.push(env.DB.prepare(`INSERT INTO daily_snapshots SELECT json_extract(value,'$.ocid'),json_extract(value,'$.date'),json_extract(value,'$.name'),json_extract(value,'$.worldName'),json_extract(value,'$.characterClass'),json_extract(value,'$.level'),CAST(json_extract(value,'$.exp') AS TEXT),json_extract(value,'$.expRate'),json_extract(value,'$.guildName'),json_extract(value,'$.imageUrl') FROM json_each(?) WHERE true ON CONFLICT(ocid,date) DO UPDATE SET name=excluded.name,world_name=excluded.world_name,character_class=excluded.character_class,level=excluded.level,exp=excluded.exp,exp_rate=excluded.exp_rate,guild_name=excluded.guild_name,image_url=excluded.image_url`).bind(JSON.stringify(body.dailySnapshots)));
 if(body.todayBaselines.length)statements.push(env.DB.prepare(`INSERT INTO today_baselines SELECT json_extract(value,'$.ocid'),json_extract(value,'$.date'),json_extract(value,'$.name'),json_extract(value,'$.level'),CAST(json_extract(value,'$.exp') AS TEXT),json_extract(value,'$.expRate') FROM json_each(?) WHERE true ON CONFLICT(ocid,date) DO UPDATE SET name=excluded.name,level=excluded.level,exp=excluded.exp,exp_rate=excluded.exp_rate`).bind(JSON.stringify(body.todayBaselines)));
 if(body.guilds.length){const guildJson=JSON.stringify(body.guilds);statements.push(env.DB.prepare("INSERT INTO guilds SELECT json_extract(value,'$.guildKey'),json_extract(value,'$.worldName'),json_extract(value,'$.name'),json_extract(value,'$.observedAt') FROM json_each(?) WHERE true ON CONFLICT(guild_key) DO UPDATE SET world_name=excluded.world_name,name=excluded.name,observed_at=excluded.observed_at").bind(guildJson),env.DB.prepare("DELETE FROM guild_members WHERE guild_key IN (SELECT json_extract(value,'$.guildKey') FROM json_each(?))").bind(guildJson));}
 if(guildMembers.length)statements.push(env.DB.prepare("INSERT INTO guild_members SELECT json_extract(value,'$.guildKey'),json_extract(value,'$.name') FROM json_each(?)").bind(JSON.stringify(guildMembers)));
 if(dailyMembers.length)statements.push(env.DB.prepare("INSERT OR REPLACE INTO guild_daily_members SELECT json_extract(value,'$.guildKey'),json_extract(value,'$.date'),json_extract(value,'$.name') FROM json_each(?)").bind(JSON.stringify(dailyMembers)));
 statements.push(env.DB.prepare("INSERT INTO sync_state(id,status,started_at,finished_at,succeeded,failed) VALUES(1,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,started_at=excluded.started_at,finished_at=excluded.finished_at,succeeded=excluded.succeeded,failed=excluded.failed").bind(body.sync.status,body.sync.startedAt??null,body.sync.finishedAt??null,body.sync.succeeded,body.sync.failed),env.DB.prepare("DELETE FROM ingest_batches WHERE accepted_at<?").bind(now-7*86400));
 await env.DB.batch(statements);return json({ok:true,batchId:auth.batch,current:body.current.length,dailySnapshots:body.dailySnapshots.length});
}

async function route(request:Request,env:Env){
 const url=new URL(request.url),path=url.pathname,method=request.method;
 if(method!=="GET"&&method!=="HEAD"&&!path.startsWith("/internal/")){const origin=request.headers.get("origin");if(origin!==url.origin)throw new ApiError(403,"허용하지 않는 요청 출처입니다.");}
 if(path==="/api/status"&&method==="GET")return json({database:true,collector:Boolean(env.INGEST_HMAC_SECRET),providers:[{name:"google",configured:Boolean(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET)},{name:"kakao",configured:false},{name:"naver",configured:false}],intervalMinutes:15,favoriteLimit:FAVORITE_LIMIT});
 if(path==="/api/device"&&method==="POST")return device(request,env);
 if(path==="/api/me"&&method==="GET")return me(request,env);
 if(path==="/api/profile"&&method==="POST")return profile(request,env);
 if(path==="/api/activity"&&method==="POST")return activity(request,env);
 if(path==="/api/dashboard"&&method==="GET")return dashboard(request,env);
 if(path==="/auth/google/start"&&method==="GET")return googleStart(request,env);
 if(path==="/auth/google/callback"&&method==="GET")return googleCallback(request,env);
 if(path==="/api/logout"&&method==="POST")return logout(request,env);
 if(path==="/api/account/delete"&&method==="POST")return deleteAccount(request,env);
 if(path==="/internal/v1/subscriptions"&&method==="GET")return subscriptions(request,env);
 if(path==="/internal/v1/ingest"&&method==="POST")return ingest(request,env);
 if(path.startsWith("/api/")||path.startsWith("/auth/")||path.startsWith("/internal/"))throw new ApiError(404,"요청한 기능을 찾을 수 없습니다.");
 return env.ASSETS.fetch(request);
}

export default {async fetch(request:Request,env:Env){
  try{return addSecurity(await route(request,env),new URL(request.url).pathname.startsWith("/api/")||new URL(request.url).pathname.startsWith("/internal/"));}
  catch(error){if(error instanceof ApiError)return addSecurity(json({error:error.message},error.status),true);console.error("edge request failed",error instanceof Error?error.message:"unknown");return addSecurity(json({error:"서비스 처리 중 오류가 발생했습니다."},500),true);}
 }} satisfies ExportedHandler<Env>;
