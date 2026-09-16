// 따라잡기 카드 재배치와 아바타 직접 렌더링 규칙을 검증합니다.
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
 it("캐릭터 이미지는 기존 체감 크기로 직접 렌더링해 중앙에 배치",()=>{
  expect(css).toMatch(/\.character-avatar img\{[^}]*top:50%[^}]*left:50%[^}]*width:192px[^}]*height:192px[^}]*transform:translate\(-50%,-50%\)/);
  expect(css).toMatch(/\.hero-card>\.character-avatar img\{[^}]*top:50%[^}]*left:50%[^}]*width:504px[^}]*height:504px[^}]*transform:translate\(-50%,-50%\)/);
 });
});
