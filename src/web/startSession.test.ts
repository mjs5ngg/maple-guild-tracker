// 익명 로컬 설정과 로그인 계정 설정의 병합 규칙을 검증합니다.
import {beforeEach,expect,it,vi} from "vitest";
import {ACCOUNT_REFRESH_MS,createProfileSync,readLocalProfile,readUnsentProfile,recordLocalChange,sameProfile,shouldRefreshAccount,startSession,writeLocalProfile} from "./startSession";
const values=new Map<string,string>();
beforeEach(()=>{values.clear();vi.stubGlobal("localStorage",{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)});});
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
 expect(await startSession(api)).toEqual({signedIn:false,unreachable:true,primary:"대표",favorites:[]});
});
it("연속 즐겨찾기 변경은 마지막 값 한 번만 보낸다",async()=>{
 vi.useFakeTimers();const send=vi.fn().mockResolvedValue({ok:true}),sync=createProfileSync(send,2000);
 sync.schedule({primary:"대표",favorites:["가"]});sync.schedule({primary:"대표",favorites:["가","나"]});
 await vi.advanceTimersByTimeAsync(2000);
 expect(send.mock.calls).toEqual([[{primary:"대표",favorites:["가","나"]}]]);vi.useRealTimers();
});
it("이미 동기화한 값과 같으면 보내지 않는다",async()=>{
 const send=vi.fn().mockResolvedValue({ok:true}),sync=createProfileSync(send);
 sync.markSynced({primary:"대표",favorites:["나","가"]});
 expect(await sync.sendNow({primary:"대표",favorites:["가","나"]})).toBe(false);
 expect(send).not.toHaveBeenCalled();
 expect(sameProfile({primary:"대표",favorites:["가"]},{primary:"대표",favorites:["다"]})).toBe(false);
});
it("다른 기기 변경은 5분이 지나야 다시 읽는다",()=>{
 expect(shouldRefreshAccount(1_000,1_000+ACCOUNT_REFRESH_MS-1)).toBe(false);
 expect(shouldRefreshAccount(1_000,1_000+ACCOUNT_REFRESH_MS)).toBe(true);
});
it("보내기 전에 앱이 종료돼도 다음 실행 때 서버 값으로 덮어쓰지 않고 먼저 올린다",async()=>{
 const sync=createProfileSync(vi.fn().mockResolvedValue({ok:true}),60_000);
 sync.schedule({primary:"대표",favorites:["새친구"]});
 writeLocalProfile({primary:"대표",favorites:["새친구"]});
 const api=vi.fn().mockResolvedValueOnce({signedIn:true,primary:"대표",favorites:[]}).mockResolvedValueOnce({ok:true});
 expect(await startSession(api)).toEqual({signedIn:true,primary:"대표",favorites:["새친구"]});
 expect(api.mock.calls[1]).toEqual(["/api/profile",{primary:"대표",favorites:["새친구"]}]);
 expect(await startSession(vi.fn().mockResolvedValue({signedIn:true,primary:"대표",favorites:["새친구"]}))).toEqual({signedIn:true,primary:"대표",favorites:["새친구"]});
});
it("전송에 성공하면 보내지 못한 변경 기록을 지운다",async()=>{
 const send=vi.fn().mockResolvedValue({ok:true}),sync=createProfileSync(send,60_000);
 sync.schedule({primary:"대표",favorites:["친구"]});
 expect(sync.hasPending()).toBe(true);
 await sync.flush();
 expect(sync.hasPending()).toBe(false);
 const api=vi.fn().mockResolvedValue({signedIn:true,primary:"대표",favorites:["친구"]});
 await startSession(api);
 expect(api.mock.calls).toEqual([["/api/me"]]);
});
it("전송이 실패하면 변경을 잃지 않고 다시 보낼 수 있다",async()=>{
 const send=vi.fn().mockRejectedValueOnce(new Error("연결 실패")).mockResolvedValue({ok:true}),sync=createProfileSync(send,60_000);
 sync.schedule({primary:"대표",favorites:["친구"]});
 await expect(sync.flush()).rejects.toThrow("연결 실패");
 expect(sync.hasPending()).toBe(true);
 await sync.flush();
 expect(send).toHaveBeenCalledTimes(2);
});
it("로그인 확인 전에 추가한 즐겨찾기는 서버가 비어 있어도 유지하고 한 번 올린다",async()=>{
 recordLocalChange({primary:"대표",favorites:["새친구"]});
 const api=vi.fn().mockResolvedValueOnce({signedIn:true,primary:"대표",favorites:[]}).mockResolvedValueOnce({ok:true});
 expect(await startSession(api)).toEqual({signedIn:true,primary:"대표",favorites:["새친구"]});
 expect(api.mock.calls).toEqual([["/api/me"],["/api/profile",{primary:"대표",favorites:["새친구"]}]]);
 expect(readUnsentProfile()).toBeNull();
});
it("미전송 변경을 올리다 실패해도 서버 값으로 덮지 않고 로그인을 유지한다",async()=>{
 recordLocalChange({primary:"대표",favorites:["새친구"]});
 const api=vi.fn().mockResolvedValueOnce({signedIn:true,primary:"대표",favorites:[]}).mockRejectedValueOnce(new Error("요청이 너무 많습니다."));
 expect(await startSession(api)).toEqual({signedIn:true,unsynced:true,primary:"대표",favorites:["새친구"]});
 expect(readLocalProfile()).toEqual({primary:"대표",favorites:["새친구"]});
 expect(readUnsentProfile()).toEqual({primary:"대표",favorites:["새친구"]});
});
it("미전송 변경이 서버 값과 같으면 쓰기 없이 기록만 지운다",async()=>{
 recordLocalChange({primary:"대표",favorites:["친구"]});
 const api=vi.fn().mockResolvedValue({signedIn:true,primary:"대표",favorites:["친구"]});
 await startSession(api);
 expect(api.mock.calls).toEqual([["/api/me"]]);
 expect(readUnsentProfile()).toBeNull();
});
it("대표가 비어 있는 미전송 변경은 계정의 대표로 보완해 보낸다",async()=>{
 recordLocalChange({primary:"",favorites:["친구"]});
 const api=vi.fn().mockResolvedValueOnce({signedIn:true,primary:"계정대표",favorites:[]}).mockResolvedValueOnce({ok:true});
 expect(await startSession(api)).toEqual({signedIn:true,primary:"계정대표",favorites:["친구"]});
 expect(api.mock.calls[1]).toEqual(["/api/profile",{primary:"계정대표",favorites:["친구"]}]);
});
