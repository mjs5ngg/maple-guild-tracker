import {defineConfig} from "@playwright/test";

export default defineConfig({
 testDir:"tests/visual",
 timeout:90_000,
 expect:{toHaveScreenshot:{animations:"disabled",maxDiffPixelRatio:0.005}},
 use:{baseURL:"http://127.0.0.1:4174",channel:"chrome",colorScheme:"dark",viewport:{width:1600,height:1000}},
 webServer:{command:"npx vite --host 127.0.0.1 --port 4174 --strictPort",url:"http://127.0.0.1:4174/design/mockups/dashboard.html",reuseExistingServer:true}
});
