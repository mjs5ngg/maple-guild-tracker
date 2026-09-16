// 데스크톱·모바일·PC 위젯·Android 위젯 시안의 고정 크기 시각 회귀를 검사합니다.
import {expect,test} from "@playwright/test";

for(const id of ["desktop","mobile","pc-widget","android-widget"]){
 test(`${id} 디자인 기준`,async({page})=>{
  await page.goto("/design/mockups/dashboard.html",{waitUntil:"domcontentloaded"});
  await page.locator("body").evaluate(async()=>await document.fonts.ready);
  await expect(page.locator(`#${id}`)).toHaveScreenshot(`${id}.png`);
 });
}

test("웹 아바타 발 기준선은 모든 반응형 조건에서 하단 2px을 유지",async({browser})=>{
 const cases=[
  {name:"PC",width:1440,height:900,deviceScaleFactor:1,isMobile:false},
  {name:"태블릿",width:1024,height:768,deviceScaleFactor:1,isMobile:false},
  {name:"모바일",width:360,height:800,deviceScaleFactor:3,isMobile:true},
  {name:"모바일 넓은 화면",width:412,height:915,deviceScaleFactor:3,isMobile:true},
  {name:"모바일 데스크톱 보기",width:980,height:1740,deviceScaleFactor:3,isMobile:true},
 ];
 const image="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><path d="M130 200h40" stroke="red"/></svg>');
 for(const item of cases){
  const context=await browser.newContext({viewport:{width:item.width,height:item.height},deviceScaleFactor:item.deviceScaleFactor,isMobile:item.isMobile,hasTouch:item.isMobile});
  const page=await context.newPage();
  await page.setContent(`<link rel="stylesheet" href="http://127.0.0.1:4174/src/web/web.css"><main><div class="character-avatar"><img src="${image}"></div><section class="hero-card"><div class="character-avatar"><img src="${image}"></div><span></span><span></span></section><div class="chase-profile"><div class="character-avatar"><img src="${image}"></div><span></span></div><label class="chase-option"><input type="checkbox"><div class="character-avatar"><img src="${image}"></div><span></span></label><div class="widget-ranking"><article><i>1</i><div class="character-avatar"><img src="${image}"></div><span></span><strong></strong></article></div></main>`,{waitUntil:"load"});
  const gaps=await page.locator(".character-avatar").evaluateAll(elements=>elements.map(element=>{const container=element.getBoundingClientRect(),image=element.querySelector("img")!.getBoundingClientRect();return container.bottom-(image.top+image.height*2/3);}));
  for(const gap of gaps)expect(gap,`${item.name}의 발 기준 간격`).toBeCloseTo(2,4);
  await context.close();
 }
});
