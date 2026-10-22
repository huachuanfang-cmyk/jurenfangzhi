import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {parse} from 'acorn';

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
// 执行真实页面入口，验证重复调用不会触碰已挂载的表单。
const script=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));
const ast=parse(script,{ecmaVersion:'latest'});
for(const [name,id] of [['pgDD','dd-o'],['pgDW','wd-o']]) {
  const node=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);
  const editor={value:'order-123',unsavedNotes:'未保存备注',unsavedKg:145};
  let mounted=true,cleared=0;
  const page={set innerHTML(value){cleared++;throw new Error('render reached');}};
  const context=vm.createContext({document:{getElementById:key=>key===id?(mounted?editor:null):key==='pg'?page:null}});
  vm.runInContext(script.slice(node.start,node.end),context);
  for(let i=0;i<3;i++)vm.runInContext(`${name}()`,context);
  assert.equal(cleared,0);
  assert.equal(editor.value,'order-123');
  assert.equal(editor.unsavedNotes,'未保存备注');
  mounted=false;
  assert.throws(()=>vm.runInContext(`${name}()`,context),/render reached/);
  assert.equal(cleared,1,'navigating back after leaving must still render normally');
}
const nav=html.slice(html.indexOf("document.querySelectorAll('.ni').forEach(function(el){"),html.indexOf('// ═══ 侧边栏分组折叠'));
let click,active=true;
const calls=[];
vm.runInNewContext(nav,{document:{querySelectorAll:()=>[{dataset:{page:'dd'},classList:{contains:()=>active},addEventListener:(_,fn)=>{click=fn;}}]},go:p=>calls.push(p)});
click();assert.deepEqual(calls,[]);
active=false;click();assert.deepEqual(calls,['dd']);
console.log('PASS background sync preserves business editors, navigation and modals; login uses the same protection');
console.log('PASS real dyeing/weaving page entries preserve mounted editors; repeated menu clicks do not rebuild pages');
