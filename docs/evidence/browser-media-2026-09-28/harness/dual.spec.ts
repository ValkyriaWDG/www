import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {BACKGROUND_DELIVERY,MEDIA_PATH_PREFIX,DELIVERY_DURATION_SECONDS} from '../../e2e/media/delivery';
const out=process.env.BROWSER_PROOF_OUT!;
for (const scenario of ['default-webm-first','controlled-webm-network-failure'] as const) {
 test(scenario,async({browser})=>{
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.addInitScript(()=>{
   const log={events:[] as {event:string,time:number,src:string}[]};
   (window as unknown as {__fallbackLog:typeof log}).__fallbackLog=log;
   new MutationObserver((_,observer)=>{
    const video=document.querySelector<HTMLVideoElement>('[data-background-video]');
    if(!video)return;
    for(const event of ['playing','waiting','stalled','error','pause','seeking'])video.addEventListener(event,()=>log.events.push({event,time:video.currentTime,src:video.currentSrc?new URL(video.currentSrc).pathname:''}));
    observer.disconnect();
   }).observe(document,{childList:true,subtree:true});
  });
  const page=await context.newPage();
  const requests:{path:string,range:string|null}[]=[];
  const failed:{path:string,error:string|null}[]=[];
  page.on('request',request=>{const pathname=new URL(request.url()).pathname;if(/\.(mp4|webm)$/.test(pathname))requests.push({path:pathname,range:request.headers()['range']??null});});
  page.on('requestfailed',request=>{if(/\.(mp4|webm)$/.test(new URL(request.url()).pathname))failed.push({path:new URL(request.url()).pathname,error:request.failure()?.errorText??null});});
  if(scenario==='controlled-webm-network-failure')await page.route(/\/media\/background\/.*\.webm$/,route=>route.abort('failed'));
  await page.goto('/cs');
  await expect(page.locator('[data-background-state]')).toHaveAttribute('data-background-state','playing');
  const expected=MEDIA_PATH_PREFIX+(scenario==='default-webm-first'?BACKGROUND_DELIVERY.webm:BACKGROUND_DELIVERY.mp4);
  const facts=()=>page.locator('[data-background-video]').evaluate((video:HTMLVideoElement)=>({currentSrc:new URL(video.currentSrc).pathname,currentTime:video.currentTime,duration:video.duration,width:video.videoWidth,height:video.videoHeight,paused:video.paused,muted:video.muted,rate:video.playbackRate,error:video.error?.code??null,quality:(()=>{const quality=video.getVideoPlaybackQuality();return {totalVideoFrames:quality.totalVideoFrames,droppedVideoFrames:quality.droppedVideoFrames,creationTime:quality.creationTime};})(),sourceElements:[...video.querySelectorAll('source')].map(source=>({src:new URL(source.src).pathname,type:source.type}))}));
  const initial=await facts();expect(initial.currentSrc).toBe(expected);expect(initial.duration).toBeCloseTo(DELIVERY_DURATION_SECONDS,1);expect(initial.sourceElements).toHaveLength(2);
  await expect.poll(async()=>(await facts()).currentTime-initial.currentTime).toBeGreaterThan(3);
  const after=await facts();expect(after.paused).toBe(false);expect(after.error).toBeNull();expect(after.width).toBe(1920);expect(after.height).toBe(1080);
  if(scenario==='default-webm-first')expect(requests.filter(request=>request.path.endsWith('.mp4'))).toHaveLength(0);
  else{expect(failed.some(request=>request.path.endsWith('.webm'))).toBe(true);expect(requests.some(request=>request.path.endsWith('.mp4'))).toBe(true);}
  await mkdir(out,{recursive:true});await page.evaluate(()=>document.fonts.ready.then(()=>undefined));await page.screenshot({path:path.join(out,`${scenario}.png`)});
  const payload={browserProduct:process.env.BROWSER_PROOF_PRODUCT,scenario,recordedAt:new Date().toISOString(),revision:{sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:Boolean(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim())},browser:browser.version(),viewport:page.viewportSize(),route:'/cs',sourceConfiguration:'Original WebM-first plus MP4 configuration',control:scenario==='controlled-webm-network-failure'?'Only WebM network requests deliberately aborted by Playwright; media APIs/player unmodified':'None',initial,after,requests,failed,log:await page.evaluate(()=>(window as unknown as {__fallbackLog:unknown}).__fallbackLog),caption:`Actual local standalone application in ${process.env.BROWSER_PROOF_PRODUCT} at 1440x900. ${scenario==='controlled-webm-network-failure'?'Controlled WebM network failure; native application player selected the full H.264 MP4.':'Default WebM-first configuration; native application player selected the VP9 WebM.'} Synthetic local content; no production or real Discord access.`};
  await writeFile(path.join(out,`${scenario}.json`),JSON.stringify(payload,null,2)+'\n');await context.close();
 });
}