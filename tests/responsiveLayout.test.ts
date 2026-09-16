// 따라잡기 카드 재배치와 아바타 정수 배율 렌더링 규칙을 검증합니다.
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const css=readFileSync(new URL("../src/web/web.css",import.meta.url),"utf8");

describe("공개 웹 반응형 레이아웃",()=>{
 it("따라잡기 표는 카드 너비 기반 중간형과 좁은형 배치를 제공",()=>{
  expect(css).toContain("container-name:chase-table");
  expect(css).toContain("@container chase-table (max-width:54rem)");
  expect(css).toContain('grid-template-areas:"avatar identity catchup" "avatar today catchup" "avatar period average"');
  expect(css).toContain("@container chase-table (max-width:38rem)");
 });
 it("캐릭터 이미지는 원본 240px와 정확한 2배 크기를 사용",()=>{
  expect(css).toMatch(/\.character-avatar img\{[^}]*width:240px[^}]*height:240px[^}]*transform:none/);
  expect(css).toMatch(/\.hero-card>\.character-avatar img\{[^}]*width:480px[^}]*height:480px[^}]*transform:none/);
 });
});
