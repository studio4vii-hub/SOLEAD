const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),M=require('./model.js');
function harness(){
 const store=new Map(),elements=new Map(),seed=[{id:1,name:'Тест',group:'Сервисы',currency:'RUB',amount:1000,payments:[],notes:[]}];let failWrite=false;
 const el=key=>{if(!elements.has(key))elements.set(key,{open:false,dataset:{},classList:{toggle(){}},setAttribute(){},removeAttribute(){},querySelectorAll(){return[]}});return elements.get(key)};
 const localStorage={getItem:k=>store.get(k)??null,setItem(k,v){if(failWrite&&k==='etude-finance-v1'){const e=Error('Quota');e.name='QuotaExceededError';throw e}store.set(k,v)},removeItem:k=>store.delete(k)};
 const context=vm.createContext({FinanceModel:M,window:{ETUDE_SEED:seed,addEventListener(){}},document:{querySelector:el,querySelectorAll(){return[]}},localStorage,structuredClone,console,crypto:require('node:crypto').webcrypto,setTimeout(){return 1},clearTimeout(){}});
 vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8'),context);
 return {run:s=>vm.runInContext(s,context),store,setFailure:v=>failWrite=v};
}
test('failed storage write leaves balances and prior undo snapshot intact',()=>{const h=harness();h.run("change('first',ds=>{ds[0].amount=900})");const prior=h.store.get('etude-finance-undo-v2');h.setFailure(true);assert.throws(()=>h.run("change('second',ds=>{ds[0].amount=800})"));assert.equal(h.run('debts[0].amount'),900);assert.equal(JSON.parse(h.store.get('etude-finance-v1'))[0].amount,900);assert.equal(h.store.get('etude-finance-undo-v2'),prior)});
test('one-step undo restores data after a change and consumes its snapshot',()=>{const h=harness();h.run("change('payment',ds=>{ds[0].amount=750})");assert.equal(h.run('undoState.debts[0].amount'),1000);h.run("persist(undoState.debts,'payment',{isUndo:true})");assert.equal(h.run('debts[0].amount'),1000);assert.equal(h.run('undoState'),null);assert.equal(JSON.parse(h.store.get('etude-finance-undo-v2')),null)});
test('another tab cannot be overwritten with stale in-memory data',()=>{const h=harness();h.store.set('etude-finance-v1','[]');assert.throws(()=>h.run("change('edit',ds=>{ds[0].amount=500})"),/другой вкладке/);assert.equal(h.run('debts[0].amount'),1000);assert.equal(h.store.get('etude-finance-v1'),'[]')});
