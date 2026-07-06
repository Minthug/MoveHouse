import { chromium } from 'playwright'
const browser = await chromium.launch()
const ctx = await browser.newContext()
await ctx.grantPermissions(['clipboard-read','clipboard-write'])
const p = await ctx.newPage()
p.on('dialog', d=>d.accept())
await p.goto('http://localhost:5176', { waitUntil: 'domcontentloaded' })
await p.evaluate(() => {
  const mk=(id,lat,lng,name,label,dur,fare,rent)=>({id,lat,lng,name,label,rent,routes:{transit:{duration:dur,fare,distance:dur*350,steps:[{type:'subway',name:'2호선',duration:dur,coords:Array.from({length:20},(_,i)=>[37.5+i*0.001,127+i*0.001])}]},bus:null},loading:false})
  const boards=[{id:'b1',name:'강남 기준',destination:{id:'d1',lat:37.4979,lng:127.0276,name:'강남구 역삼동 테헤란로',type:'work'},destination2:null,candidates:[mk('c1',37.5045,126.7859,'부천 중동 사거리','A',63,1850,450000),mk('c2',37.3820,127.1189,'분당 정자동','B',33,1500,550000)]}]
  localStorage.setItem('commute-boards', JSON.stringify(boards)); localStorage.setItem('commute-active-board','b1')
})
await p.reload({ waitUntil: 'networkidle' })
await p.waitForTimeout(700)
await p.getByText('강남 기준',{exact:false}).click()
await p.waitForTimeout(700)
await p.getByText('링크 공유',{exact:false}).click()
await p.waitForTimeout(400)
const link = await p.evaluate(()=>navigator.clipboard.readText())
console.log('새 링크 길이:', link.length)
// 참고: 예전 방식(경로 포함, encodeURIComponent) 길이 추정
const oldPayload = await p.evaluate(()=>{
  const boards=JSON.parse(localStorage.getItem('commute-boards'))
  const b=boards[0]
  const data={dest:{lat:b.destination.lat,lng:b.destination.lng,name:b.destination.name,type:b.destination.type},cands:b.candidates.map(c=>({lat:c.lat,lng:c.lng,name:c.name,label:c.label,routes:c.routes,memo:c.memo}))}
  return btoa(encodeURIComponent(JSON.stringify(data))).length
})
console.log('예전 방식 길이(추정):', oldPayload)
// 새 탭에서 열기
const p2 = await ctx.newPage()
await p2.goto(link, { waitUntil:'networkidle' })
await p2.waitForTimeout(8000)
const title = await p2.$eval('h1',e=>e.innerText).catch(()=>'?')
const cards = await p2.$$eval('.overflow-y-auto .bg-white.border', els=>els.map(e=>{
  const nm=(e.innerText.match(/[가-힣]+ [가-힣]+/)||[''])[0]
  const t=(e.innerText.match(/🚇[^\n]*/)||['(경로없음)'])[0]
  const real=(e.innerText.match(/실질 월[^\n]*/)||[''])[0]
  return nm+' | '+t+' | '+real
}))
console.log('열린 보드:', title)
cards.forEach((c,i)=>console.log(' CARD'+i, c))
await browser.close()
