// 익명 이용 현황 신호의 중복 억제와 개인정보 비전송을 검증합니다.
import {beforeEach,expect,it,vi} from "vitest";
import {ACTIVITY_INTERVAL_MS,reportVisitorActivity} from "./visitorActivity";

const local=new Map<string,string>(),session=new Map<string,string>();
const storage=(values:Map<string,string>)=>({getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key),clear:()=>values.clear(),key:()=>null,get length(){return values.size;}} as Storage);
beforeEach(()=>{local.clear();session.clear();vi.stubGlobal("localStorage",storage(local));vi.stubGlobal("sessionStorage",storage(session));});

it("같은 문서에서는 한 시간 안에 중복 신호를 보내지 않는다",async()=>{
 const fetcher=vi.fn(async()=>new Response("{}",{status:200})) as unknown as typeof fetch;
 expect(await reportVisitorActivity(fetcher,1000)).toBe(true);
 expect(await reportVisitorActivity(fetcher,1000+ACTIVITY_INTERVAL_MS-1)).toBe(false);
 expect(fetcher).toHaveBeenCalledTimes(1);
 const body=JSON.parse(String((fetcher as any).mock.calls[0][1].body));
 expect(body.visitor).toMatch(/^[a-f0-9]{64}$/);
 expect(body.sessionStart).toBe(true);
 expect(JSON.stringify(body)).not.toContain("apiKey");
});

it("한 시간이 지나면 같은 익명 이용자의 활성 시각을 갱신한다",async()=>{
 const fetcher=vi.fn(async()=>new Response("{}",{status:200})) as unknown as typeof fetch;
 await reportVisitorActivity(fetcher,1000);
 expect(await reportVisitorActivity(fetcher,1000+ACTIVITY_INTERVAL_MS)).toBe(true);
 const first=JSON.parse(String((fetcher as any).mock.calls[0][1].body));
 const second=JSON.parse(String((fetcher as any).mock.calls[1][1].body));
 expect(second.visitor).toBe(first.visitor);
 expect(second.sessionStart).toBe(false);
});
