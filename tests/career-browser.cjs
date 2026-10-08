// Run against tests/career_server.py (8001) and Vite preview (5174), never production.
const {chromium} = require(process.argv[2] || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const {spawn} = require('node:child_process');
const readline = require('node:readline');
const inprocess = process.env.CAREER_TEST_INPROCESS === '1';
const base = inprocess ? 'http://career.test' : 'http://127.0.0.1:5174';
(async()=>{
  fs.mkdirSync('test-results/jobs', {recursive:true});
  let bridge;
  const pending=new Map();let sequence=0;
  if(inprocess){
    bridge=spawn(process.env.CAREER_TEST_PYTHON || '.venv/Scripts/python.exe',['tests/career_browser_bridge.py'],{stdio:['pipe','pipe','inherit']});
    readline.createInterface({input:bridge.stdout}).on('line',line=>{const r=JSON.parse(line);const callback=pending.get(r.id);pending.delete(r.id);callback?.(r);});
  }
  const browser = await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || 'msedge'});
  try {
    async function routeContext(context){
      if(!inprocess)return;
      await context.route('http://career.test/**',async route=>{
        const req=route.request(),url=new URL(req.url());
        if(url.pathname.startsWith('/api/jobs/')){
          const id=++sequence;
          const reply=await new Promise(resolve=>{pending.set(id,resolve);bridge.stdin.write(JSON.stringify({id,method:req.method(),path:url.pathname+url.search,headers:req.headers(),body:(req.postDataBuffer() || Buffer.alloc(0)).toString('base64')})+'\n');});
          if(reply.error)throw Error(reply.error);
          await route.fulfill({status:reply.status,headers:reply.headers,body:Buffer.from(reply.body,'base64')});
        }else{
          const asset=url.pathname.startsWith('/assets/') ? 'assets/'+path.basename(url.pathname) : 'index.html';
          const mime=asset.endsWith('.js')?'text/javascript':asset.endsWith('.css')?'text/css':'text/html';
          await route.fulfill({contentType:mime,body:fs.readFileSync(path.join('test-results/career-build',asset))});
        }
      });
    }
    const context = await browser.newContext({viewport:{width:1440,height:1100}});
    await routeContext(context);
    const page = await context.newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    async function login(target) {
      await target.goto(base+'/jobs');
      await target.getByLabel('비밀번호',{exact:true}).fill('browser-test-password');
      await target.getByRole('button',{name:'로그인',exact:true}).click();
    }
    await login(page);
    await page.getByRole('heading',{name:'첫 공고를 추가해 보세요'}).waitFor();
    await page.getByRole('button',{name:'예시 공고로 미리보기'}).click();
    assert.equal(await page.locator('.job-card').count(),4);
    await page.getByLabel('직무',{exact:true}).selectOption('DevOps');
    assert.equal(await page.locator('.job-card').count(),1);
    await page.getByRole('button',{name:'초기화',exact:true}).click();
    await page.getByLabel('직선거리',{exact:true}).selectOption('10');
    assert.equal(await page.locator('.job-card').count(),0);
    await page.getByRole('button',{name:'전체 공고 보기',exact:true}).click();
    await page.getByRole('button',{name:'＋ 공고 직접 추가',exact:true}).click();
    const dialog=page.getByRole('dialog');
    await dialog.getByLabel('회사명',{exact:true}).fill('검증 회사');
    await dialog.getByLabel('포지션',{exact:true}).fill('검증용 플랫폼 엔지니어');
    await dialog.getByLabel('공고 본문',{exact:true}).fill('BOSH, Grafana, Kubernetes 운영 경험');
    await dialog.getByRole('button',{name:'공고 추가',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    await page.getByRole('button',{name:'검증용 플랫폼 엔지니어',exact:true}).waitFor();
    assert.equal(await page.locator('.job-card').count(),1);
    await page.reload();
    await page.getByRole('button',{name:'검증용 플랫폼 엔지니어',exact:true}).waitFor();
    await page.getByRole('button',{name:'검증 회사 관심 공고 저장',exact:true}).click();
    await page.getByRole('button',{name:'검증 회사 관심 공고 해제',exact:true}).waitFor();
    await page.screenshot({path:'test-results/jobs/desktop.png',fullPage:true});
    await page.getByRole('link',{name:'내 이력서 관리',exact:true}).click();
    await page.getByRole('heading',{name:'내 이력서 관리',exact:true}).waitFor();
    await page.locator('input[type=file]').setInputFiles({name:'resume.txt',mimeType:'text/plain',buffer:Buffer.from('BOSH 운영 자동화 검증')});
    await page.getByText('resume.txt의 텍스트를 읽었습니다.',{exact:false}).waitFor();
    await page.getByRole('button',{name:'편집 영역에 반영'}).click();
    assert.equal(await page.getByLabel('회사 실무 경험',{exact:true}).inputValue(),'BOSH 운영 자동화 검증');
    await page.getByLabel('위도',{exact:true}).fill('37.5');
    await page.getByLabel('경도',{exact:true}).fill('127');
    await page.getByRole('button',{name:'좌표 적용',exact:true}).click();
    await page.getByRole('button',{name:'추천 프로필 저장'}).click();
    await page.getByText('서버에 저장했습니다.',{exact:true}).waitFor();
    await page.reload();
    await page.getByLabel('회사 실무 경험',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('회사 실무 경험',{exact:true}).inputValue(),'BOSH 운영 자동화 검증');
    await page.locator('input[type=file]').setInputFiles({name:'resume.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF')});
    await page.getByText('PDF 파일 형식이 아닙니다.',{exact:true}).waitFor();
    await page.screenshot({path:'test-results/jobs/profile.png',fullPage:true});
    await page.getByRole('link',{name:'회사 찾기',exact:true}).click();
    await page.getByRole('button',{name:'경험 비교 및 상세 →',exact:true}).click();
    await page.getByText('근무지·회사 규모 수정 / 공고 삭제',{exact:true}).click();
    await dialog.getByLabel('위도',{exact:true}).fill('37.5');
    await dialog.getByLabel('경도',{exact:true}).fill('127');
    await dialog.getByRole('button',{name:'좌표 적용',exact:true}).click();
    await dialog.getByRole('button',{name:'공고 정보 저장',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    await page.getByText(/직선 0km/).waitFor();
    await page.getByRole('button',{name:/공고 수집처 관리/}).click();
    await page.getByLabel('회사명',{exact:true}).fill('테스트 수집처');
    await page.getByLabel('게시판 식별자',{exact:true}).fill('test-fixture');
    await page.getByRole('button',{name:'수집처 추가',exact:true}).click();
    await page.getByText('테스트 수집처 · greenhouse/test-fixture',{exact:true}).waitFor();
    const second = await browser.newContext({viewport:{width:390,height:844}});
    await routeContext(second);
    const mobile=await second.newPage();mobile.on('pageerror',e=>errors.push(e.message));
    await login(mobile);
    await mobile.getByRole('button',{name:'검증용 플랫폼 엔지니어',exact:true}).waitFor();
    assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
    await mobile.screenshot({path:'test-results/jobs/mobile.png',fullPage:true});
    await page.getByRole('button',{name:'로그아웃',exact:true}).click();
    await page.getByRole('button',{name:'로그인',exact:true}).waitFor();
    assert.equal(await page.evaluate(async()=> (await fetch('/api/jobs/state')).status),401);
    assert.deepEqual(errors,[]);
    console.log('PASS: real backend login, manual jobs, status, server persistence across browsers, TXT extraction, invalid PDF, coordinates/distance, source registration, logout, mobile layout.');
  } finally {await browser.close();bridge?.stdin.end();}
})().catch(e=>{console.error(e);process.exitCode=1;});
