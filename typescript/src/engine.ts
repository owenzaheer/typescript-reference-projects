import { createHmac, timingSafeEqual } from 'node:crypto';
export type Payload = Record<string, unknown>;
type Row = Record<string, any>;
export class Problem extends Error { constructor(public status: number, message: string) { super(message); } }
function text(p:Payload,k:string):string { const v=p[k]; if(typeof v!=='string'||!v.trim()||v.length>100)throw new Problem(422,k+' is required'); return v; }
function integer(p:Payload,k:string,min=0):number { const v=p[k]; if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min)throw new Problem(422,k+' must be an integer >= '+min); return v; }
function canonical(p:Payload):string{return JSON.stringify(Object.fromEntries(Object.keys(p).sort().map(k=>[k,p[k]])));}
export class Engine {
 private stock=10;private stockVersion=0;
 private orders=new Map<string,Row>();private events=new Map<string,Row>();private proposals=new Map<string,Row>();private grades=new Map<string,Row>();
 private invoices=new Map([['INV-100',10000],['INV-200',2500]]);private outbox:Row[]=[];private audit:Row[]=[];
 signature(p:Payload){return createHmac('sha256','local-fixture-signing-key').update(canonical(p)).digest('hex');}
 state(){return structuredClone({stock:this.stock,stockVersion:this.stockVersion,orders:[...this.orders.values()],invoices:[...this.invoices].map(([id,balance])=>({id,balance})),events:[...this.events.values()],proposals:[...this.proposals.values()],grades:[...this.grades.values()],outbox:this.outbox,audit:this.audit});}
 command(action:string,p:Payload,role:string='learner'):Row { const r=this.execute(action,p,role);this.audit.push({action,role,payload:structuredClone(p)});return structuredClone(r); }
 private find(table:Map<string,Row>,id:string):Row {const r=table.get(id);if(!r)throw new Problem(404,'Record not found');return r;}
 private execute(action:string,p:Payload,role:string):Row {
  if(action==='reserve'){
   const id=text(p,'id'),sku=text(p,'sku'),quantity=integer(p,'quantity',1),old=this.orders.get(id);
   if(old){if(old.sku!==sku||old.quantity!==quantity)throw new Problem(409,'Conflicting idempotency key');return old;}
   if(sku!=='BOOK'||integer(p,'version')!==this.stockVersion||quantity>this.stock)throw new Problem(409,'Insufficient stock or stale version');
   this.stock-=quantity;this.stockVersion++;const r={id,sku,quantity,status:'reserved',version:0,expires:Date.now()+300000};this.orders.set(id,r);this.outbox.push({id,event:'order.reserved',delivered:false});return r;
  }
  if(['ship','cancel','refund'].includes(action)){
   if(role!=='operator')throw new Problem(403,'Operator required');const r=this.find(this.orders,text(p,'id')),status={ship:'shipped',cancel:'cancelled',refund:'refunded'}[action as 'ship'|'cancel'|'refund'];
   if(r.status===status)return r;if(r.status!==(action==='refund'?'shipped':'reserved')||r.version!==integer(p,'version'))throw new Problem(409,'Invalid transition or stale version');
   if(action==='ship'&&r.expires<Date.now())throw new Problem(409,'Reservation expired');if(action==='cancel'){this.stock+=r.quantity;this.stockVersion++;}r.status=status;r.version++;this.outbox.push({id:r.id,event:'order.'+status,delivered:false});return r;
  }
  if(action==='relay'){
   if(role!=='operator')throw new Problem(403,'Operator required');if(p.simulateFailure===true)throw new Problem(503,'Fixture relay outage; messages retained');const pending=this.outbox.filter(r=>!r.delivered);const result={delivered:structuredClone(pending)};pending.forEach(r=>r.delivered=true);return result;
  }
  if(action==='callback'){
   const {signature,...body}=p;const expected=this.signature(body);if(typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(expected,'hex')))throw new Problem(401,'Invalid callback signature');
   const id=text(body,'id'),invoice=text(body,'invoice'),amount=integer(body,'amount',1),old=this.events.get(id),encoded=canonical(body);
   if(old){if(old.body!==encoded)throw new Problem(409,'Event id reused with different payload');return old.result;}
   const balance=this.invoices.get(invoice);if(balance===undefined)throw new Problem(404,'Invoice not found');const result={id,invoice,amount,status:balance===amount?'matched':'exception'};if(result.status==='matched')this.invoices.set(invoice,0);this.events.set(id,{id,body:encoded,result});return result;
  }
  if(action==='propose'){
   if(role!=='reviewer')throw new Problem(403,'Reviewer required');const id=text(p,'id'),invoice=text(p,'invoice'),amount=integer(p,'amount',1),balance=this.invoices.get(invoice);if(balance===undefined)throw new Problem(404,'Invoice not found');if(amount>balance)throw new Problem(422,'Adjustment exceeds remaining balance');if(this.proposals.has(id))throw new Problem(409,'Proposal already exists');const r={id,invoice,amount,status:'pending'};this.proposals.set(id,r);return r;
  }
  if(action==='approve'){
   if(role!=='reviewer')throw new Problem(403,'Reviewer required');const r=this.find(this.proposals,text(p,'id'));if(r.status==='approved')return r;const balance=this.invoices.get(r.invoice)!;if(balance<r.amount)throw new Problem(409,'Balance changed; proposal requires review');this.invoices.set(r.invoice,balance-r.amount);r.status='approved';return r;
  }
  if(action==='submit'){
   if(!['learner','instructor'].includes(role))throw new Problem(403,'Learner required');const id=text(p,'id'),student=text(p,'student'),deadline=integer(p,'deadline');if(deadline<Date.now()/1000)throw new Problem(422,'Submission deadline passed');const answers=p.answers;if(!Array.isArray(answers)||answers.length!==3||answers.some(a=>typeof a!=='string'))throw new Problem(422,'Three answer strings required');if(this.grades.has(id))throw new Problem(409,'Repeated submission');const expected=['transaction','idempotency','audit'],score=answers.filter((a,i)=>a.trim().toLowerCase()===expected[i]).length;const r={id,student,score,status:'pending',feedback:'',version:0};this.grades.set(id,r);return r;
  }
  if(['feedback','publish'].includes(action)){
   if(role!=='instructor')throw new Problem(403,'Instructor required');const r=this.find(this.grades,text(p,'id'));if(r.version!==integer(p,'version'))throw new Problem(409,'Stale assessment version');if(action==='feedback'){r.feedback=text(p,'feedback');r.status='review';}else{if(r.status!=='review')throw new Problem(409,'Instructor feedback review required');r.status='published';}r.version++;return r;
  }
  throw new Problem(404,'Unknown action');
 }
}
