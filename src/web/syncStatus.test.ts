// 수집 중인 작업을 대기로 표시하지 않고 실패와 완료를 구분하는지 검증합니다.
import {describe,it,expect} from "vitest";
import {syncStatusText} from "./syncStatus";
const run={startedAt:"2026-09-08T00:00:00Z",finishedAt:null,failed:0};
describe("공용 수집 상태",()=>{
 it("최초 대기와 실행 중을 구별",()=>{
  expect(syncStatusText(null)).toBe("첫 수집 대기");
  expect(syncStatusText({...run,status:"running"})).toContain("수집 진행 중");
  expect(syncStatusText(run)).toContain("수집 진행 중");
 });
 it("정상 완료와 일부 실패를 구별",()=>{
  const finished={...run,finishedAt:"2026-09-08T00:05:00Z"};
  expect(syncStatusText({...finished,status:"completed"})).toContain("갱신 완료");
  expect(syncStatusText({...finished,status:"partial",failed:3})).toContain("일부 수집 실패 3건");
 });
 it("중단과 저장 오류를 성공으로 표시하지 않음",()=>{
  expect(syncStatusText({...run,status:"interrupted"})).toContain("이전 수집 중단");
  expect(syncStatusText({...run,status:"storage_error"})).toContain("저장 오류");
 });
});
