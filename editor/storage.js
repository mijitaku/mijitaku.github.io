const FORMAT='mijitaku-editor',VERSION=1;
let database;
function openDb(){
  if(database)return database;
  database=new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB){reject(new Error('このブラウザでは自動保存を使えません。編集データを保存してください。'));return;}
    const req=indexedDB.open('mijitaku-editor',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('drafts');
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    req.onblocked=()=>reject(new Error('別のタブを閉じてからお試しください。'));
  }).catch(error=>{database=null;throw error;});return database;
}
export async function saveDraft(data){const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(data,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('保存が中断されました。'));});}
export async function readDraft(){const db=await openDb();return new Promise((resolve,reject)=>{const req=db.transaction('drafts').objectStore('drafts').get('current');req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);});}
export function bytesToBase64(bytes){let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);}
export function base64ToBytes(value){return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
export function makeProject(state){return {format:FORMAT,version:VERSION,savedAt:new Date().toISOString(),...state};}
export function validateProject(input){
  const fail=()=>{throw new Error('このファイルは対応する身仕度の編集データではありません。');};
  if(!input||input.format!==FORMAT||input.version!==VERSION||!Array.isArray(input.items)||!input.items.length||input.items.length>300)fail();
  const str=(s,max)=>{if(typeof s!=='string'||s.length>max)fail();return s;};
  const seen=new Set();
  const items=input.items.map((i,index)=>{
    if(!i||typeof i!=='object')fail();const id=str(i.id,100);if(seen.has(id))fail();seen.add(id);
    const title=str(i.title,200);
    if(i.kind==='text'){
      if(i.layout&&!['afterword','reader'].includes(i.layout))fail();
      return {id,kind:'text',title,author:str(i.author,100),body:str(i.body,200000),preface:str(i.preface||'',2000),indent:i.indent!==false,combineDigits:i.combineDigits!==false,...(i.layout?{layout:i.layout}:{})};
    }
    if(i.kind==='toc'){
      if(!Array.isArray(i.entries)||i.entries.length>10)fail();
      return {id,kind:'toc',title,entries:i.entries.map(e=>({title:str(e.title,200),author:str(e.author,100),reader:e.reader===true}))};
    }
    if(i.kind==='image'){
      const im=i.image;if(!im||!Number.isInteger(im.width)||!Number.isInteger(im.height)||im.width<1||im.height<1||im.width>2400||im.height>2400)fail();
      const data=str(im.data,40000000);if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(data))fail();
      return {id,kind:'image',title,fit:i.fit==='cover'?'cover':'contain',image:{data,width:im.width,height:im.height,name:str(im.name,500)}};
    }
    fail();
  });
  let font=null;
  if(input.font){const data=str(input.font.data,28000000);if(!/^[A-Za-z0-9+/]+={0,2}$/.test(data))fail();font={name:str(input.font.name,500),data};}
  return makeProject({items,selectedId:seen.has(input.selectedId)?input.selectedId:items[0].id,startSide:input.startSide==='even'?'even':'odd',pdfName:str(input.pdfName||'',200),font});
}
