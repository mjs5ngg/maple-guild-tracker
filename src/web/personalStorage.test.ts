// 저장 허용과 차단 환경에서 개인 키 접근이 안전하게 처리되는지 검증합니다.
import {afterEach,expect,it,vi} from "vitest";
import {readPersonal,writePersonal} from "./personalStorage";
afterEach(()=>vi.unstubAllGlobals());
it("저장 차단을 조회 중단 예외로 전파하지 않는다",()=>{
 const blocked=()=>{throw new Error("blocked");};
 vi.stubGlobal("localStorage",{getItem:blocked,setItem:blocked,removeItem:blocked});
 expect(readPersonal("key")).toBeNull();
 expect(writePersonal("key","test")).toBe(false);
 expect(writePersonal("key",null)).toBe(false);
});
it("저장과 삭제가 허용되면 그대로 반영한다",()=>{
 const values=new Map<string,string>();
 vi.stubGlobal("localStorage",{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)});
 expect(writePersonal("key","test")).toBe(true);
 expect(readPersonal("key")).toBe("test");
 expect(writePersonal("key",null)).toBe(true);
 expect(readPersonal("key")).toBeNull();
});
