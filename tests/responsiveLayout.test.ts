// 따라잡기 카드 재배치와 아바타 직접 렌더링 규칙을 검증합니다.
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const css=readFileSync(new URL("../src/web/web.css",import.meta.url),"utf8");

describe("공개 웹 반응형 레이아웃",()=>{
 it("따라잡기 표는 카드 너비 기반 중간형과 좁은형 배치를 제공",()=>{
 expect(css).toContain("container-name:chase-table");
 expect(css).toContain("@container chase-table (max-width:54rem)");
  expect(css).toContain('grid-template-areas:"profile catchup" "metrics metrics"');
  expect(css).toContain("@container chase-table (max-width:38rem)");
  expect(css).toContain('grid-template-areas:"profile" "catchup" "metrics"');
  expect(css).toContain(".chase-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))");
 });
 it("따라잡기 하단 카드는 그리드 열을 채우고 모바일에서 목록 다음 프리셋 순서를 유지",()=>{
  expect(css).toContain(".chase-lower>.surface{box-sizing:border-box;width:100%;min-width:0;max-width:none;margin:0}");
  expect(css).toContain(".overview-grid,.chase-lower{grid-template-columns:1fr}");
  expect(css).not.toContain(".preset-panel{order:-1}");
 });
 it("캐릭터 발 기준점을 모든 이미지 칸 하단에서 2px 위에 배치",()=>{
  expect(css).toContain(".character-avatar{position:relative;--avatar-render-size:192px}");
  expect(css).toMatch(/\.character-avatar img\{[^}]*top:auto[^}]*bottom:2px[^}]*left:50%[^}]*width:var\(--avatar-render-size\)[^}]*height:var\(--avatar-render-size\)[^}]*transform:translate\(-50%,33\.333333%\)/);
  expect(css).toContain(".hero-card>.character-avatar{--avatar-render-size:504px}");
  expect(css).not.toContain(".chase-profile>.character-avatar img,.chase-option>.character-avatar img");
 });
 it("정밀 포인터 PC에서는 비정수 도트 배율을 고품질로 보간",()=>{
  expect(css).toContain("@media(hover:hover) and (pointer:fine){.character-avatar img{image-rendering:auto}}");
 });
});
