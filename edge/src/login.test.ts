// Google 로그인 흐름이 임시값을 D1에 쓰지 않고 세션 1건만 남기는지 검증합니다.
import {afterEach,expect,it,vi} from "vitest";
import worker,{pkceChallenge} from "./index";
import {readToken,signToken} from "./security";

const verifier="dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const origin="https://guildfollow.com";

function fakeEnv(existingUser:string|null){
 const writes:string[]=[],reads:string[]=[];
 const statement=(sql:string)=>{const self={sql,bind:()=>self,
  first:async()=>{reads.push(sql);return sql.includes("FROM identities")&&existingUser?{user_id:existingUser}:null;},
  run:async()=>{writes.push(sql);return {meta:{changes:1}};},
  all:async()=>{reads.push(sql);return {results:[]};}};return self;};
 const DB={prepare:statement,batch:async(list:{sql:string}[])=>{writes.push(...list.map(item=>item.sql));return [];}};
 return {env:{DB,GOOGLE_CLIENT_ID:"id",GOOGLE_CLIENT_SECRET:"secret"} as unknown as Parameters<typeof worker.fetch>[1],writes,reads};
}
function mockGoogle(){
 vi.stubGlobal("fetch",vi.fn(async(url:string)=>url.includes("oauth2.googleapis.com/token")?Response.json({access_token:"at"}):Response.json({sub:"google-sub"})));
}
afterEach(()=>vi.unstubAllGlobals());

it("서명 토큰은 변조·만료를 거절한다",async()=>{
 const token=await signToken("k",{t:"x",u:"u",c:"c",e:200,n:"n"});
 expect(await readToken("k",token,100)).toMatchObject({u:"u"});
 expect(await readToken("k",token,201)).toBeNull();
 expect(await readToken("other",token,100)).toBeNull();
 expect(await readToken("k",token.replace(/^./,"A"),100)).toBeNull();
});

async function androidLogin(existingUser:string|null){
 const {env,writes,reads}=fakeEnv(existingUser);mockGoogle();
 const start=await worker.fetch(new Request(`${origin}/auth/android/start-v2`,{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify({challenge:await pkceChallenge(verifier)})}),env);
 const state=new URL((await start.json() as {url:string}).url).searchParams.get("state")!;
 expect(writes).toEqual([]);
 const callback=await worker.fetch(new Request(`${origin}/auth/google/callback?code=g&state=${encodeURIComponent(state)}`),env);
 const location=callback.headers.get("location")||"";
 expect(location.startsWith("guildfollow://auth?code=")).toBe(true);
 const code=new URL(location).searchParams.get("code")!;
 const exchange=await worker.fetch(new Request(`${origin}/auth/android/exchange`,{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify({code,verifier})}),env);
 return {exchange,code,env,writes,reads};
}

it("기존 사용자의 Android 로그인은 D1에 세션 1건만 쓴다",async()=>{
 const {exchange,writes}=await androidLogin("user-1");
 expect(exchange.status).toBe(200);
 expect(typeof (await exchange.json() as {session:string}).session).toBe("string");
 expect(writes).toHaveLength(1);
 expect(writes[0]).toContain("INSERT INTO sessions");
});

it("신규 사용자는 사용자·계정 연결·세션만 쓴다",async()=>{
 const {writes}=await androidLogin(null);
 expect(writes.map(sql=>sql.split(" ").slice(0,3).join(" "))).toEqual(["INSERT INTO users(id,last_active)","INSERT INTO identities(provider,subject,user_id)","INSERT INTO sessions(token_hash,user_id,expires_at,kind)"]);
});

it("다른 검증값으로는 교환 코드를 쓸 수 없다",async()=>{
 const {code,env}=await androidLogin("user-1");
 const response=await worker.fetch(new Request(`${origin}/auth/android/exchange`,{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify({code,verifier:"x".repeat(43)})}),env);
 expect(response.status).toBe(400);
});

it("웹 로그인 상태는 시작한 브라우저 쿠키와 묶인다",async()=>{
 const {env,writes}=fakeEnv("user-1");mockGoogle();
 const start=await worker.fetch(new Request(`${origin}/auth/google/start`),env);
 const state=new URL(start.headers.get("location")!).searchParams.get("state")!;
 const browser=/maple_login=([^;]+)/.exec(start.headers.get("set-cookie")||"")![1];
 const other=await worker.fetch(new Request(`${origin}/auth/google/callback?code=g&state=${encodeURIComponent(state)}`,{headers:{cookie:"maple_login=someone-else"}}),env);
 expect(other.status).toBe(400);
 const ok=await worker.fetch(new Request(`${origin}/auth/google/callback?code=g&state=${encodeURIComponent(state)}`,{headers:{cookie:`maple_login=${browser}`}}),env);
 expect(ok.status).toBe(302);
 expect(ok.headers.get("set-cookie")).toContain("maple_session=");
 expect(writes).toHaveLength(1);
});
