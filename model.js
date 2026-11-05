(function(root){
'use strict';
const round=n=>Math.round((n+Number.EPSILON)*100)/100,cents=n=>Math.round(n*100);
const validMoney=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1e12&&Math.abs(n-round(n))<0.00001;
const validDate=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)||s<'1900-01-01'||s>'2200-12-31')return false;const d=new Date(s+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function addDays(s,n){const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function addMonths(s,n){const d=new Date(s+'T12:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10)}
const paid=d=>round(d.payments.reduce((s,p)=>s+p.amount,0));
const planRemaining=(d,p)=>round(p.amount-d.payments.flatMap(p=>p.allocations||[]).filter(a=>a.id===p.id).reduce((s,a)=>s+a.amount,0));
const planned=d=>round((d.plans||[]).reduce((s,p)=>s+planRemaining(d,p),0));
function validateContact(c){
 if(!c||typeof c!=='object'||Array.isArray(c))throw Error('Некорректная контактная информация.');
 const limits={phone:40,telegram:32,email:254,company:200,note:1000},out={};
 for(const [key,max] of Object.entries(limits)){const value=c[key]??'';if(typeof value!=='string'||value.length>max)throw Error('Проверь длину контактных полей.');out[key]=value.trim()}
 if(out.phone&&!/^\+?[\d\s().-]{5,40}$/.test(out.phone))throw Error('Телефон: используй цифры, пробелы, скобки и знак + в начале.');
 if(out.phone&&out.phone.replace(/\D/g,'').length<5)throw Error('В номере телефона должно быть не менее 5 цифр.');
 if(out.telegram&&!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(out.telegram))throw Error('Telegram: укажи username из 5–32 латинских букв, цифр и подчёркиваний, начиная с буквы.');
 if(out.email&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(out.email))throw Error('Проверь адрес электронной почты.');
 return out;
}
function normalize(input){
 if(!Array.isArray(input)||input.length>10000)throw Error('Ожидается список обязательств (до 10 000 записей).');
 const ids=new Set();
 return input.map((d,i)=>{
  const fail=()=>{throw Error('Некорректные данные в записи '+(i+1)+'. Импорт отменён.');};
  const text=(v,max)=>typeof v==='string'&&v.length<=max;
  if(!d||!Number.isSafeInteger(d.id)||d.id<1||d.id>=Number.MAX_SAFE_INTEGER||ids.has(d.id)||!text(d.name,120)||!d.name.trim()||!text(d.group,120)||!validMoney(d.amount)||!['RUB','USDT'].includes(d.currency)||!Array.isArray(d.payments)||!Array.isArray(d.notes))fail();
  ids.add(d.id);
  if(d.initial!=null&&(!validMoney(d.initial)||d.initial===0))fail();
  if(d.dueDate&&!validDate(d.dueDate))fail();
  if(d.rate!=null&&(typeof d.rate!=='number'||!Number.isFinite(d.rate)||d.rate<0||d.rate>1000))fail();
  const planIds=new Set(),plans=(d.plans||[]).map(p=>{if(!p||!text(p.id,100)||!p.id||planIds.has(p.id)||!validDate(p.date)||!validMoney(p.amount)||p.amount===0)fail();planIds.add(p.id);return{id:p.id,date:p.date,amount:p.amount}});
  const payments=d.payments.map((p,j)=>{
   if(!p||!validMoney(p.amount)||p.amount===0||(p.date&&!validDate(p.date))||!text(p.method,120))fail();
   const allocations=(p.allocations||[]).map(a=>{if(!a||!planIds.has(a.id)||!validMoney(a.amount)||a.amount===0)fail();return{id:a.id,amount:a.amount}});
   if(allocations.reduce((s,a)=>s+cents(a.amount),0)>cents(p.amount))fail();
   return {id:text(p.id,100)&&p.id?p.id:'legacy-'+j,amount:p.amount,date:p.date||'',method:p.method,allocations};
  });
  if(new Set(payments.map(p=>p.id)).size!==payments.length)fail();
  for(const p of plans){if(payments.flatMap(p=>p.allocations).filter(a=>a.id===p.id).reduce((s,a)=>s+cents(a.amount),0)>cents(p.amount))fail()}
  const notes=d.notes.map(n=>{if(!n||!text(n.text,5000)||!text(n.date,100))fail();return{text:n.text,date:n.date}});
  const events=(d.events||[]).map(e=>{if(!e||!text(e.text,1000)||!validDate(e.date))fail();return{text:e.text,date:e.date}});
  const result={id:d.id,name:d.name.trim(),group:d.group,amount:d.amount,currency:d.currency,payments,notes,plans,events,dueDate:d.dueDate||'',rate:d.rate??null,terms:text(d.terms,5000)?d.terms:'',favorite:d.favorite===true,source:d.source==='import'?'import':'manual'};
  if(d.contact!=null)result.contact=validateContact(d.contact);
  if(d.initial!=null)result.initial=d.initial;
  if(planned(result)>round(result.amount)+0.001)fail();
  if(result.dueDate&&plans.some(p=>planRemaining(result,p)>0&&p.date>result.dueDate))fail();
  return result;
 });
}
function dueEntries(d){
 if(d.amount<=0)return [];
 const list=(d.plans||[]).map(p=>({id:p.id,date:p.date,amount:planRemaining(d,p)})).filter(p=>p.amount>0);
 const residual=round(d.amount-list.reduce((s,p)=>s+p.amount,0));
 if(d.dueDate&&residual>0)list.push({id:'final',date:d.dueDate,amount:residual});
 return list.sort((a,b)=>a.date.localeCompare(b.date));
}
function status(d,date=today()){
 if(d.amount===0)return{key:'closed',label:'Закрыт'};
 const next=dueEntries(d)[0];
 if(!next)return{key:'undated',label:'Без срока'};
 if(next.date<date)return{key:'overdue',label:'Просрочен'};
 if(next.date===date)return{key:'today',label:'Сегодня'};
 if(next.date<=addDays(date,7))return{key:'soon',label:'В течение 7 дней'};
 return{key:'scheduled',label:'Запланирован'};
}
function recordPayment(d,p){
 if(!validMoney(p.amount)||p.amount<=0||p.amount>d.amount)throw Error('Сумма должна быть больше нуля и не больше остатка.');
 if(!validDate(p.date)||p.date>today())throw Error('Укажите дату выплаты не позднее сегодняшней.');
 let remaining=cents(p.amount);const allocations=[];
 for(const entry of dueEntries(d)){if(entry.id==='final')continue;const amount=Math.min(cents(entry.amount),remaining);if(amount>0){allocations.push({id:entry.id,amount:amount/100});remaining-=amount}}
 d.amount=(cents(d.amount)-cents(p.amount))/100;d.payments.push({...p,allocations});
}
function cancelPayment(d,id){const i=d.payments.findIndex(p=>p.id===id);if(i<0)throw Error('Выплата не найдена.');const [p]=d.payments.splice(i,1);d.amount=round(d.amount+p.amount);return p}
function parseBackup(text){let data;try{data=JSON.parse(text)}catch{throw Error('Файл не является корректным JSON.')}if(!data||![1,2].includes(data.version))throw Error('Поддерживаются резервные копии ETUDE версии 1 и 2.');return normalize(data.debts)}
function monthlyPayments(debts,currency,date=today(),count=6){const end=date.slice(0,7)+'-01';return Array.from({length:count},(_,i)=>{const month=addMonths(end,i-count+1).slice(0,7);return{month,amount:round(debts.filter(d=>d.currency===currency).flatMap(d=>d.payments).filter(p=>p.date.startsWith(month)).reduce((s,p)=>s+p.amount,0))}})}
const api={round,cents,validMoney,validDate,today,addDays,addMonths,normalize,paid,planRemaining,planned,dueEntries,status,recordPayment,cancelPayment,parseBackup,monthlyPayments,validateContact};
if(typeof module!=='undefined')module.exports=api;else root.FinanceModel=api;
})(typeof window!=='undefined'?window:globalThis);
