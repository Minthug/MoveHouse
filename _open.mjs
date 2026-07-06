import { chromium } from 'playwright'
const browser = await chromium.launch()
const ctx = await browser.newContext()
const p = await ctx.newPage()
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())})
// 새 포맷 링크 직접 구성 (부천/분당 → 강남)
const r6=n=>Math.round(n*1e6)/1e6
const dest=[37.4979,127.0276,'강남구 역삼동','work']
const packed={n:'강남 기준',d:dest,c:[[37.5045,126.7859,'부천 중동',450000,''],[37.3820,127.1189,'분당 정자동',550000,'']]}
const s=Buffer.from(JSON.stringify(packed),'utf-8').toString('base64')
const link='http://localhost:5176/?s='+s
console.log('링크 길이:', link.length)
await p.goto(link, { waitUntil:'networkidle' })
await p.waitForTimeout(9000)  // 경로 재계산 대기 (순차 조회)
const title = await p.$eval('h1',e=>e.innerText).catch(()=>'?')
const cards = await p.$$eval('.overflow-y-auto .bg-white.border', els=>els.map(e=>{
  const nm=(e.innerText.match(/[가-힣]+ [가-힣]+/)||[''])[0]
  const t=(e.innerText.match(/🚇[^\n]*/)||['(경로 계산중/없음)'])[0]
  const real=(e.innerText.match(/실질 월[^\n]*/)||[''])[0]
  return nm+' | '+t+(real?' | '+real:'')
}))
console.log('열린 보드:', title)
cards.forEach((c,i)=>console.log(' CARD'+i, c))
await browser.close()
console.log('errs:', errs.slice(0,3).join(' | ')||'none')
