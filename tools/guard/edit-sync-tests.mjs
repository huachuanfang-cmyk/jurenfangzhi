import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');
const block = html.slice(html.indexOf('var _lastAutoSync='), html.indexOf('async function authLogin('));
async function scenario({page='dd', modal=false, nextPage, nextModal, navigate=false}={}) {
  let listener, finish;
  const calls=[];
  const state={page,modal};
  const context=vm.createContext({
    Date, _authReady:true, _authUser:{}, isOnline:()=>true,
    document:{visibilityState:'visible',
      querySelector:s=>s==='.ni.on'?{dataset:{page:state.page}}:state.modal?{}:null,
      addEventListener:(name,fn)=>{listener=fn;}},
    pullFromSupabase:()=>new Promise(resolve=>{finish=resolve;}),
    go:p=>calls.push(p),
  });
  vm.runInContext(block,context);
  context._lastAutoSync=0;
  listener();
  if(nextPage)state.page=nextPage;
  if(nextModal)state.modal=true;
  if(navigate)context._pageRevision++;
  if(finish)finish();
  await new Promise(resolve=>setImmediate(resolve));
  return calls;
}

for(const page of ['dd','dw','orders','quot','arec','fgstock','custs','settings']) {
  assert.deepEqual(await scenario({page}),[], `${page}: syncing must preserve editor DOM`);
}
assert.deepEqual(await scenario({page:'dash'}),['dash']);
assert.deepEqual(await scenario({page:'dash',nextPage:'dd',navigate:true}),[]);
assert.deepEqual(await scenario({page:'dash',nextModal:true}),[]);
assert.deepEqual(await scenario({page:'dash',navigate:true}),[]);
assert.deepEqual(await scenario({page:'orders',modal:true}),[]);
const auth=html.slice(html.indexOf('async function onAuthSuccess(){'),html.indexOf('function showLogin(){'));
assert.match(auth,/var revision=_pageRevision;/);
assert.match(auth,/refreshDashboardAfterSync\(revision\)/);
assert.doesNotMatch(auth,/\bgo\(/);
assert.match(html,/function go\(p\)\{\s*_pageRevision\+\+;/);
console.log('PASS background sync preserves business editors, navigation and modals; login uses the same protection');
