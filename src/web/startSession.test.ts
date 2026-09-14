// 익명 로컬 설정과 로그인 계정 설정의 병합 규칙을 검증합니다.
import {beforeEach,expect,it,vi} from "vitest";
import {readLocalProfile,startSession,writeLocalProfile} from "./startSession";
const values=new Map<string,string>();
beforeEach(()=>{values.clear();vi.stubGlobal("localStorage",{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});});
it("익명 사용자는 기기 세션을 만들지 않고 로컬 설정을 사용한다",async()=>{
 writeLocalProfile({primary:"대표",favorites:["친구"]});const api=vi.fn().mockResolvedValue({signedIn:false,primary:"",favorites:[]});
 expect(await startSession(api)).toEqual({signedIn:false,primary:"대표",favorites:["친구"]});
 expect(api.mock.calls).toEqual([["/api/me"]]);
});
it("첫 로그인에서 비어 있는 계정으로 로컬 설정을 한 번 이관한다",async()=>{
 writeLocalProfile({primary:"대표",favorites:["친구"]});const api=vi.fn().mockResolvedValueOnce({signedIn:true,primary:"",favorites:[]}).mockResolvedValueOnce({ok:true});
 expect(await startSession(api)).toEqual({signedIn:true,primary:"대표",favorites:["친구"]});
 expect(api.mock.calls).toEqual([["/api/me"],["/api/profile",{primary:"대표",favorites:["친구"]}]]);
});
it("계정 설정이 있으면 로컬 복사본도 갱신한다",async()=>{
 const api=vi.fn().mockResolvedValue({signedIn:true,primary:"계정대표",favorites:["계정친구"]});
 expect(await startSession(api)).toEqual({signedIn:true,primary:"계정대표",favorites:["계정친구"]});
 expect(readLocalProfile()).toEqual({primary:"계정대표",favorites:["계정친구"]});
});
it("서버 연결 실패 중에도 로컬 설정으로 시작한다",async()=>{
 writeLocalProfile({primary:"대표",favorites:[]});const api=vi.fn().mockRejectedValue(new Error("연결 실패"));
 expect(await startSession(api)).toEqual({signedIn:false,primary:"대표",favorites:[]});
});
