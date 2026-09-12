// 데스크톱·모바일·PC 위젯·Android 위젯 시안의 고정 크기 시각 회귀를 검사합니다.
import {expect,test} from "@playwright/test";

for(const id of ["desktop","mobile","pc-widget","android-widget"]){
 test(`${id} 디자인 기준`,async({page})=>{
  await page.goto("/design/mockups/dashboard.html",{waitUntil:"domcontentloaded"});
  await page.locator("body").evaluate(async()=>await document.fonts.ready);
  await expect(page.locator(`#${id}`)).toHaveScreenshot(`${id}.png`);
 });
}
