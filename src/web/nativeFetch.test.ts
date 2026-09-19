// 앱 모드 네이티브 통로가 fetch와 같은 방식으로 성공·실패·취소를 돌려주는지 검증합니다.
import {afterEach,expect,it,vi} from "vitest";

afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
async function load(){
 vi.stubGlobal("__APP__",true);
 const sent:string[]=[];let handler:((event:{data:string})=>void)|undefined;
 vi.stubGlobal("window",{AndroidNet:{postMessage:(message:string)=>sent.push(message),addEventListener:(_:string,listener:(event:{data:string})=>void)=>{handler=listener;}}});
 const module=await import("./nativeFetch");
 return {...module,sent,reply:(value:unknown)=>handler!({data:JSON.stringify(value)})};
}

it("네이티브 응답을 Response로 돌려준다",async()=>{
 const {appFetch,sent,reply}=await load();
 const pending=appFetch("https://guildfollow.com/api/me",{headers:{"content-type":"application/json"}});
 const request=JSON.parse(sent[0]);
 expect(request).toMatchObject({method:"GET",url:"https://guildfollow.com/api/me",headers:{"content-type":"application/json"},body:null});
 reply({id:request.id,status:429,body:"{}",headers:{"retry-after":"3"}});
 const response=await pending;
 expect(response.status).toBe(429);expect(response.headers.get("retry-after")).toBe("3");
});
it("연결 실패는 fetch처럼 TypeError로 거절한다",async()=>{
 const {appFetch,sent,reply}=await load();
 const pending=appFetch("https://open.api.nexon.com/x");
 reply({id:JSON.parse(sent[0]).id,status:0,error:"실패"});
 await expect(pending).rejects.toBeInstanceOf(TypeError);
});
it("취소 신호를 따른다",async()=>{
 const {appFetch}=await load();const controller=new AbortController();
 const pending=appFetch("https://guildfollow.com/api/me",{signal:controller.signal});
 controller.abort(new Error("취소"));
 await expect(pending).rejects.toThrow("취소");
});
