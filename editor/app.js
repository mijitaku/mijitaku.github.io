import {saveDraft,readDraft,makeProject,validateProject,bytesToBase64,base64ToBytes} from './storage.js?v=14';
import {createWebZip} from './web-export.js?v=14';
import {paginate,pageSvg,missingCharacters,createPdf,graphemes,prefaceLength} from './layout.js?v=14';
import {buildBook,moveItem,imageSvg,readImageFile} from './book.js?v=14';
const $=id=>document.getElementById(id);
let font,fontBytes,proof,currentPage=0,busy=false,objectUrl,revision=0,pdfFile,sharing=false,pdfOutput=null;
let webFile=null,webUrl=null;
let draftReady=false,draftDirty=false,draftTimer=null,draftChain=Promise.resolve(),draftVersion=0,customFont=null,currentFontName='ZENオールド明朝',backupFile=null,backupUrl=null;
let serial=1;
const newText=()=>({id:'item-'+serial++,kind:'text',title:'',author:'',body:'',indent:true,combineDigits:true});
let items=[newText()],selectedId=items[0].id;
const selectedItem=()=>items.find(i=>i.id===selectedId);
function saveCurrent(){const item=selectedItem();if(item?.kind==='text')Object.assign(item,inputs());}
function renderList(){
  const list=$('book-list');list.replaceChildren();
  items.forEach((item,index)=>{
    const li=document.createElement('li');li.className='book-row'+(item.id===selectedId?' selected':'');
    const select=document.createElement('button');select.type='button';select.className='item-select';select.dataset.action='select';select.dataset.id=item.id;select.setAttribute('aria-current',item.id===selectedId?'true':'false');
    const name=document.createElement('span');name.className='item-name';name.textContent=`${String(index+1).padStart(2,'0')}　${item.title|| (item.kind==='text'?'タイトル未入力':'画像ページ')}`;
    const detail=document.createElement('span');detail.className='item-detail';const section=proof?.sections.find(s=>s.id===item.id);detail.textContent=(item.kind==='toc'?'目次':item.kind==='text'?(item.layout==='reader'?'読者寄稿':item.layout==='afterword'?'あとがき':'本文')+(item.author?'・'+item.author:''):'画像')+(section?`・${section.start}〜${section.start+section.count-1}ページ`:'');select.append(name,detail);li.append(select);
    const controls=document.createElement('div');controls.className='item-controls';
    for(const [action,label,glyph,disabled] of [['up','前へ移動','↑',index===0],['down','後ろへ移動','↓',index===items.length-1],['remove','削除','削除',false]]){
      const button=document.createElement('button');button.type='button';button.dataset.action=action;button.dataset.id=item.id;button.setAttribute('aria-label',`${item.title||'ページ'}を${label}`);button.textContent=glyph;button.disabled=busy||disabled;controls.append(button);
    }
    select.disabled=busy;li.append(controls);list.append(li);
  });
  $('preview-button').textContent=items.length>1?'並び順で確認':'縦書きで確認';
}
function renderEditor(){
  const item=selectedItem();const image=item?.kind==='image',toc=item?.kind==='toc';$('manuscript-form').hidden=image||toc;$('image-editor').hidden=!image;$('toc-editor').hidden=!toc;if(toc)renderToc();
  $('input-heading').textContent=toc?'目次を作る':image?'画像を入れる':item?.layout==='reader'?'読者寄稿を入れる':item?.layout==='afterword'?'あとがきを入れる':'原稿を入れる';
  $('afterword-help').hidden=item?.layout!=='afterword';
  $('reader-fields').hidden=item?.layout!=='reader';$('preface').value=item?.preface||'';updatePrefaceCount();
  $('title').maxLength=item?.layout==='reader'?27:item?.layout==='afterword'?18:54;
  if(image){$('image-title').value=item.title;$('image-fit').value=item.fit;$('image-description').textContent=`${item.image.name}・${item.image.width} × ${item.image.height}px。1枚を1ページにします。`;}
  else if(item?.kind==='text'){for(const id of ['title','author','body'])$(id).value=item[id];$('indent').checked=item.indent;$('combine-digits').checked=item.combineDigits;}
  $('char-count').textContent=image?'':graphemes(($('body').value||'').replace(/\[\[([^\n]*?)\]\]/g,'$1').replace(/\s/g,'')).length.toLocaleString('ja')+'字';
}
function selectItem(id){saveCurrent();selectedId=id;scheduleDraft();renderEditor();renderList();if(proof){const index=proof.pages.findIndex(p=>p.itemId===id);if(index>=0){currentPage=index;showPage();}}}
function message(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function setBusy(value){busy=value;$('preview-button').disabled=value||!font;$('sample-button').disabled=value;$('export').disabled=value||!proof;$('export-web').disabled=value||!proof;$('font-file').disabled=value;for(const id of ['import-project','backup-project','save-draft','add-toc','toc-import','toc-add','toc-preview','add-text','add-reader','add-image','add-afterword','replace-image','image-preview'])$(id).disabled=value;renderList();if(selectedItem()?.kind==='toc')renderToc();}
function inputs(){return {preface:$('preface').value,title:$('title').value,author:$('author').value,body:$('body').value,indent:$('indent').checked,startSide:$('start-side').value,combineDigits:$('combine-digits').checked};}
function updatePrefaceCount(){$('preface-count').textContent=prefaceLength($('preface').value)+' / 150文字';}
function invalidate(){saveCurrent();scheduleDraft();updatePrefaceCount();revision++;proof=null;pdfFile=null;$('export').disabled=true;$('export-web').disabled=true;$('download-area').hidden=true;$('web-download-area').hidden=true;webFile=null;$('proof-note').textContent='内容を変更しました。「並び順で確認」で更新してください。';$('page-info').textContent='変更は未反映';$('char-count').textContent=graphemes($('body').value.replace(/\[\[([^\n]*?)\]\]/g,'$1').replace(/\s/g,'')).length.toLocaleString('ja')+'字';renderList();}
function showPage(){
  if(!proof)return;
  const page=proof.pages[currentPage];$('paper-area').innerHTML=page.kind==='image'?imageSvg(page):pageSvg(page,font,{label:`${page.itemTitle} ${currentPage+1}ページ目`});
  $('page-info').textContent=`${currentPage+1} / ${proof.pages.length} ページ・${page.itemTitle}`;
  $('previous').disabled=currentPage===0;$('next').disabled=currentPage===proof.pages.length-1;
}
function typeset(scroll=false){
  if(!font&&items.some(i=>i.kind!=='image')){message('フォントの準備が終わるまでお待ちください。');return null;}
  try{
    saveCurrent();const next=buildBook(items,{font,startSide:$('start-side').value});
    proof=next;currentPage=Math.max(0,proof.pages.findIndex(p=>p.itemId===selectedId));showPage();$('export').disabled=busy;$('export-web').disabled=busy;renderList();
    $('proof-note').textContent=`${proof.sections.length}作品・全${proof.pages.length}ページ`;
    $('download-area').hidden=true;$('web-download-area').hidden=true;webFile=null;pdfFile=null;message('組版できました。ページを確認してPDFを作れます。');
    if(scroll&&window.innerWidth<=760)$('preview-heading').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
    return proof;
  }catch(error){proof=null;$('export').disabled=true;$('export-web').disabled=true;message(error.message,true);return null;}
}
async function loadFont(bytes,name,custom=false){
  const candidate=window.fontkit.create(new Uint8Array(bytes));
  if(!candidate.layout||!candidate.unitsPerEm)throw new Error('このフォント形式は使えません。TTFまたはOTFを選んでください。');
  if(!candidate.hasGlyphForCodePoint('あ'.codePointAt(0)))throw new Error('日本語の文字を含むフォントを選んでください。');
  font=candidate;fontBytes=new Uint8Array(bytes);currentFontName=name;customFont=custom?{name,data:bytesToBase64(fontBytes)}:null;$('font-name').textContent=`使用フォント：${name}`;invalidate();
}
$('manuscript-form').addEventListener('submit',event=>{event.preventDefault();if(!busy)typeset(true);});
$('image-preview').addEventListener('click',()=>{if(!busy)typeset(true);});
$('add-text').addEventListener('click',()=>{
  if(busy)return;saveCurrent();const current=selectedItem();
  if(!(current?.kind==='text'&&!current.title&&!current.author&&!current.body)){const item=newText();items.push(item);selectedId=item.id;}
  renderEditor();invalidate();$('title').focus();message('本文を追加しました。タイトル・作者・本文を入力してください。');
});
const blankTocEntry=()=>({title:'',author:'',reader:false});
function tocFromItems(){return items.filter(i=>i.kind==='text'&&i.title?.trim()).map(i=>({title:i.title,author:i.layout==='afterword'?'':i.author||'',reader:i.layout==='reader'}));}
function renderToc(){
  const item=selectedItem();if(item?.kind!=='toc')return;const host=$('toc-entries');host.replaceChildren();
  item.entries.forEach((entry,index)=>{
    const row=document.createElement('div');row.className='toc-entry';
    const heading=document.createElement('strong');heading.textContent=`${index+1}番目`;row.append(heading);
    for(const [key,labelText,max] of [['title','タイトル',54],['author','作者名',18]]){
      const label=document.createElement('label');label.textContent=labelText;
      const input=document.createElement('input');input.type='text';input.maxLength=max;input.value=entry[key];input.dataset.index=index;input.dataset.field=key;input.disabled=busy;label.append(input);row.append(label);
    }
    const label=document.createElement('label');label.className='check';const input=document.createElement('input');input.type='checkbox';input.checked=entry.reader;input.dataset.index=index;input.dataset.field='reader';input.disabled=busy;label.append(input,document.createTextNode('読者寄稿'));row.append(label);
    for(const [action,text,disabled] of [['up','前へ',index===0],['down','後ろへ',index===item.entries.length-1],['remove','削除',false]]){const button=document.createElement('button');button.type='button';button.textContent=text;button.dataset.index=index;button.dataset.action=action;button.disabled=busy||disabled;row.append(button);}
    host.append(row);
  });
  $('toc-add').disabled=busy||item.entries.length>=10;
}
$('add-toc').addEventListener('click',()=>{
  if(busy)return;saveCurrent();let entries=tocFromItems();if(entries.length>10){message('目次に取り込む作品は10項目以内にしてください。',true);return;}
  if(!entries.length)entries=Array.from({length:8},blankTocEntry);
  if(items.length===1&&items[0].kind==='text'&&!items[0].title&&!items[0].author&&!items[0].body&&!items[0].preface)items=[];
  const item={id:'item-'+serial++,kind:'toc',title:'目次',entries};items.push(item);selectedId=item.id;renderEditor();invalidate();message('目次を追加しました。項目の順番・タイトル・作者名を確認してください。');
});
$('toc-import').addEventListener('click',()=>{
  if(busy)return;const item=selectedItem();if(item?.kind!=='toc')return;const entries=tocFromItems();
  if(!entries.length||entries.length>10){message('タイトルのある作品を1〜10項目、先に追加してください。',true);return;}
  if(item.entries.some(e=>e.title||e.author)&&!window.confirm('目次の入力内容を、現在の作品名・作者名・順番で置き換えますか？'))return;
  item.entries=entries;renderToc();invalidate();
});
$('toc-add').addEventListener('click',()=>{const item=selectedItem();if(busy||item?.kind!=='toc'||item.entries.length>=10)return;item.entries.push(blankTocEntry());renderToc();invalidate();});
$('toc-entries').addEventListener('input',event=>{const {index,field}=event.target.dataset,item=selectedItem();if(busy||item?.kind!=='toc'||!field)return;item.entries[Number(index)][field]=field==='reader'?event.target.checked:event.target.value;invalidate();});
$('toc-entries').addEventListener('click',event=>{
  const {index,action}=event.target.dataset,item=selectedItem();if(busy||item?.kind!=='toc'||!action)return;const n=Number(index);
  if(action==='remove'){if((item.entries[n].title||item.entries[n].author)&&!window.confirm('この目次項目を削除しますか？'))return;item.entries.splice(n,1);}
  else{const next=n+(action==='up'?-1:1);if(next<0||next>=item.entries.length)return;[item.entries[n],item.entries[next]]=[item.entries[next],item.entries[n]];}
  renderToc();invalidate();
});
$('toc-preview').addEventListener('click',()=>{if(!busy)typeset(true);});
$('add-reader').addEventListener('click',()=>{
  if(busy)return;saveCurrent();
  const item={...newText(),layout:'reader',preface:''};
  if(items.length===1&&items[0].kind==='text'&&!items[0].title&&!items[0].author&&!items[0].body&&!items[0].preface)items=[];
  items.push(item);selectedId=item.id;renderEditor();invalidate();$('title').focus();message('読者寄稿を追加しました。前書き・タイトル・作者名・本文を入力してください。');
});
$('add-afterword').addEventListener('click',()=>{
  if(busy)return;saveCurrent();
  const item={...newText(),layout:'afterword',title:'あとがき'};
  if(items.length===1&&!items[0].title&&!items[0].author&&!items[0].body&&items[0].kind==='text')items=[];
  items.push(item);selectedId=item.id;renderEditor();invalidate();$('body').focus();
  message('あとがきを追加しました。本文と作者名を入力してください。');
});
$('book-list').addEventListener('click',event=>{
  const button=event.target.closest('button[data-action]');if(!button||busy)return;const {action,id}=button.dataset;
  if(action==='select'){selectItem(id);return;}
  saveCurrent();if(action==='remove'){
    const item=items.find(i=>i.id===id);if(!item)return;
    if((item.kind==='image'||item.title||item.body||item.author||item.preface)&&!window.confirm(`「${item.title||'このページ'}」を削除しますか？`))return;
    items=items.filter(i=>i.id!==id);if(!items.length)items=[newText()];if(!items.some(i=>i.id===selectedId))selectedId=items[0].id;renderEditor();
  }else items=moveItem(items,id,action==='up'?-1:1);
  invalidate();message('並び順を更新しました。「並び順で確認」で全体を確認できます。');
});
let imageRequest={replaceId:null};
function chooseImage(replaceId=null){if(busy)return;imageRequest={replaceId};$('image-files').multiple=!replaceId;$('image-files').value='';$('image-files').click();}
$('add-image').addEventListener('click',()=>chooseImage());
$('replace-image').addEventListener('click',()=>{const item=selectedItem();if(item?.kind==='image')chooseImage(item.id);});
$('image-files').addEventListener('change',async event=>{
  const files=Array.from(event.target.files||[]);if(!files.length)return;saveCurrent();setBusy(true);let added=0;const errors=[];
  try{
    for(const file of files){
      try{
        const image=await readImageFile(file);
        if(imageRequest.replaceId){const item=items.find(i=>i.id===imageRequest.replaceId);if(item){item.image=image;selectedId=item.id;added++;}break;}
        if(items.length===1&&items[0].kind==='text'&&!items[0].title&&!items[0].author&&!items[0].body)items=[];
        const item={id:'item-'+serial++,kind:'image',title:file.name.replace(/\.[^.]+$/,''),fit:'contain',image};items.push(item);selectedId=item.id;added++;
      }catch(error){errors.push(`${file.name}：${error.message}`);}
    }
    renderEditor();invalidate();
    if(added){const result=typeset(false);if(result)message(`${added}枚の画像を入れました。${errors.length?' 読み込めなかった画像：'+errors.join(' / '):'並び順と収め方を確認してください。'}`,errors.length>0);else message('画像は追加済みです。'+$('status').textContent,true);}
    else message(errors.join(' / '),true);
  }finally{setBusy(false);}
});
for(const id of ['image-title','image-fit'])$(id).addEventListener(id==='image-title'?'input':'change',()=>{
  const item=selectedItem();if(item?.kind!=='image')return;item.title=$('image-title').value;item.fit=$('image-fit').value;invalidate();
});
for(const id of ['title','author','body','preface'])$(id).addEventListener('input',invalidate);
for(const id of ['indent','start-side','combine-digits'])$(id).addEventListener('change',invalidate);
function replaceBodyRange(start,end,text,selectStart,selectEnd){
  const body=$('body');body.value=body.value.slice(0,start)+text+body.value.slice(end);body.focus();body.setSelectionRange?.(selectStart,selectEnd);invalidate();
}
$('combine-selection').addEventListener('click',()=>{
  if(busy)return;
  const body=$('body'),start=body.selectionStart,end=body.selectionEnd,selected=body.value.slice(start,end);
  if(!selected||graphemes(selected).length>4||/[\s\[\]]/u.test(selected)){message('本文で、横に並べたい1〜4文字を選択してください。空白・改行・括弧 [[ ]] は含められません。',true);return;}
  replaceBodyRange(start,end,'[['+selected+']]',start+2,end+2);message('選んだ文字を組文字にしました。「縦書きで確認」で反映できます。');
});
$('uncombine-selection').addEventListener('click',()=>{
  if(busy)return;
  const body=$('body'),start=body.selectionStart,end=body.selectionEnd;
  for(const match of body.value.matchAll(/\[\[([^\n]*?)\]\]/g)){
    const first=match.index,last=first+match[0].length;
    if(start>=first&&end<=last){replaceBodyRange(first,last,match[1],first,first+match[1].length);message('手動の組文字を解除しました。数字2桁の自動処理は「組み方・フォント」で切り替えられます。');return;}
  }
  message('解除したい [[組文字]] の中にカーソルを置いてください。',true);
});
$('previous').addEventListener('click',()=>{if(proof&&currentPage>0){currentPage--;showPage();}});
$('next').addEventListener('click',()=>{if(proof&&currentPage<proof.pages.length-1){currentPage++;showPage();}});
$('sample-button').addEventListener('click',async()=>{
  if(selectedItem()?.kind!=='text')return;
  if($('body').value.trim()&&!window.confirm('入力中の原稿を試しの原稿に置き換えますか？'))return;
  setBusy(true);
  try{const response=await fetch('sample.json');if(!response.ok)throw new Error('試しの原稿を読み込めませんでした。');const sample=await response.json();for(const id of ['title','author','body'])$(id).value=sample[id];invalidate();typeset(true);}
  catch(error){message(error.message,true);}finally{setBusy(false);}
});
$('font-file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;setBusy(true);
  try{if(file.size>20*1024*1024)throw new Error('20MB以下のフォントを選んでください。');await loadFont(await file.arrayBuffer(),file.name,true);message('フォントを切り替えました。「縦書きで確認」で更新できます。');}
  catch(error){message('フォントを読み込めませんでした。'+error.message,true);}finally{setBusy(false);}
});
function pdfName(fallback){
  const raw=($('pdf-name').value.trim()||fallback||'身仕度_本文').replace(/(?:\.pdf)+$/i,'');
  return (raw.replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g,'_').replace(/[. ]+$/g,'').slice(0,120)||'身仕度')+'.pdf';
}
function updatePdfName(){
  if(!pdfOutput||$('download-area').hidden)return;
  const name=pdfName(pdfOutput.title);
  pdfFile=typeof File==='function'?new File([pdfOutput.blob],name,{type:'application/pdf'}):null;
  $('save-link').download=name;
  $('pdf-file-info').textContent=`${name} · ${Math.max(1,Math.round(pdfOutput.blob.size/1024)).toLocaleString('ja')} KB · ${pdfOutput.pages}ページ`;
}
$('pdf-name').addEventListener('input',()=>{updatePdfName();scheduleDraft();});
$('export').addEventListener('click',async()=>{
  if(busy||!proof)return;const snapshot=proof,savedRevision=revision;setBusy(true);
  $('export').textContent='PDFを作成中…';
  try{
    const bytes=await createPdf(snapshot,fontBytes,font,window.fontkit,window.PDFLib,(page,total)=>message(`PDFを作成しています… ${page} / ${total}`));
    if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
    const name=pdfName(snapshot.title);
    pdfOutput={blob:new Blob([bytes],{type:'application/pdf'}),title:snapshot.title,pages:snapshot.pages.length};
    pdfFile=typeof File==='function'?new File([bytes],name,{type:'application/pdf'}):null;
    const link=$('download-link');link.href=objectUrl;link.removeAttribute('download');
    $('save-link').href=objectUrl;$('save-link').download=name;
    let canShare=false;try{canShare=!!(pdfFile&&navigator.share&&navigator.canShare?.({files:[pdfFile]}));}catch{}
    $('share-pdf').hidden=!canShare;
    $('pdf-file-info').textContent=`${name} · ${Math.max(1,Math.round(bytes.length/1024)).toLocaleString('ja')} KB · ${snapshot.pages.length}ページ`;
    $('save-help').textContent=canShare?'「共有して保存」を押し、「ファイルに保存」を選んでください。「PDFを開く」からも共有メニューを使えます。':'「PDFを開く」を押して、PDF画面の共有メニューから「ファイルに保存」を選んでください。パソコンでは「ダウンロード」も使えます。';
    $('download-area').hidden=false;
    message(savedRevision===revision?'PDFができました。下の保存方法を選んでください。まだ端末への保存は完了していません。':'変更前の原稿でPDFを作成しました。変更後はもう一度組版してください。');
    $('download-area').scrollIntoView({behavior:'smooth',block:'nearest'});
  }catch(error){message('PDFを作れませんでした。'+error.message,true);}finally{$('export').textContent='PDFを作る';setBusy(false);}
});
$('share-pdf').addEventListener('click',async()=>{
  if(!pdfFile||sharing)return;sharing=true;$('share-pdf').disabled=true;
  try{
    // Call the native share sheet directly in this fresh tap, before any await.
    await navigator.share({files:[pdfFile]});
    message('共有画面を閉じました。「ファイルに保存」を選んだ場合は、保存先でPDFを確認してください。');
  }catch(error){
    message(error.name==='AbortError'?'共有をキャンセルしました。PDFは下のボタンからもう一度保存できます。':'共有画面を開けませんでした。「PDFを開く」から保存するか、SafariかChromeでこのページを開いてください。',error.name!=='AbortError');
  }finally{sharing=false;$('share-pdf').disabled=false;}
});
$('export-web').addEventListener('click',async()=>{
  if(busy||!proof)return;const snapshot=proof,version=revision;setBusy(true);
  $('web-download-area').hidden=true;webFile=null;$('export-web').textContent='画像を作成中…';
  try{
    const blob=await createWebZip(snapshot,font,(page,total)=>message(`サイト用画像を作成しています… ${page} / ${total}`),()=>{if(version!==revision)throw new Error('原稿が変更されました。並び順を確認して、もう一度作成してください。');});
    const name=pdfName(snapshot.title).replace(/\.pdf$/i,'_web.zip');
    webFile=typeof File==='function'?new File([blob],name,{type:'application/zip'}):null;
    if(webUrl)URL.revokeObjectURL(webUrl);webUrl=URL.createObjectURL(blob);
    $('save-web').href=webUrl;$('save-web').download=name;
    let canShare=false;try{canShare=!!(webFile&&navigator.share&&navigator.canShare?.({files:[webFile]}));}catch{}
    $('share-web').hidden=!canShare;
    $('web-file-info').textContent=`${name} · ${snapshot.pages.length}ページ · ${Math.max(1,Math.round(blob.size/1024)).toLocaleString('ja')} KB`;
    $('web-download-area').hidden=false;message('サイト用画像ができました。ZIPを保存して展開してください。');
    $('web-download-area').scrollIntoView({behavior:'smooth',block:'nearest'});
  }catch(error){message(error.message,true);}finally{$('export-web').textContent='サイト用画像を作る';setBusy(false);}
});
$('share-web').addEventListener('click',async()=>{
  if(!webFile||sharing)return;sharing=true;$('share-web').disabled=true;
  try{await navigator.share({files:[webFile]});message('共有画面を閉じました。保存先でZIPを確認してください。');}
  catch(error){message(error.name==='AbortError'?'保存をキャンセルしました。':'共有できませんでした。「ZIPをダウンロード」から保存してください。',error.name!=='AbortError');}
  finally{sharing=false;$('share-web').disabled=false;}
});
function projectSnapshot(){saveCurrent();return makeProject({items,selectedId,startSide:$('start-side').value,pdfName:$('pdf-name').value,font:customFont});}
function scheduleDraft(){
  if(!draftReady)return;draftDirty=true;draftVersion++;$('draft-status').textContent='下書きを保存中…';
  clearTimeout(draftTimer);draftTimer=setTimeout(()=>flushDraft(),500);
  $('backup-area').hidden=true;
}
function flushDraft(){
  clearTimeout(draftTimer);if(!draftReady||!draftDirty)return draftChain;
  const version=draftVersion,data=structuredClone(projectSnapshot());
  draftChain=draftChain.catch(()=>{}).then(()=>saveDraft(data)).then(()=>{
    if(version===draftVersion){draftDirty=false;$('draft-status').textContent='下書き保存済み · '+new Date().toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'});}
  }).catch(()=>{$('draft-status').textContent='下書きを保存できません。編集データを書き出して保存してください。';});return draftChain;
}
async function restoreProject(data){
  const state=validateProject(data);let bytes,name;
  if(state.font){bytes=base64ToBytes(state.font.data);name=state.font.name;}
  else{const r=await fetch('assets/ZenOldMincho-Regular.ttf');if(!r.ok)throw new Error('フォントを読み込めませんでした。');bytes=new Uint8Array(await r.arrayBuffer());name='ZENオールド明朝';}
  const candidate=window.fontkit.create(bytes);if(!candidate.layout||!candidate.hasGlyphForCodePoint('あ'.codePointAt(0)))throw new Error('編集データのフォントを読み込めませんでした。');
  const wasReady=draftReady;draftReady=false;
  try{
    font=candidate;fontBytes=bytes;currentFontName=name;customFont=state.font;items=state.items;selectedId=state.selectedId;
    serial=Math.max(0,...items.map(i=>Number(i.id.match(/^item-(\d+)$/)?.[1]||0)))+1;
    $('start-side').value=state.startSide;$('pdf-name').value=state.pdfName;$('font-name').textContent='使用フォント：'+name;
    renderEditor();invalidate();renderList();$('paper-area').replaceChildren();$('proof-note').textContent='下書きを復元しました。「並び順で確認」で誌面を表示できます。';
  }finally{draftReady=wasReady;}
}
$('save-draft').addEventListener('click',()=>{scheduleDraft();flushDraft();});
$('backup-project').addEventListener('click',()=>{
  if(busy)return;
  try{
    const data=projectSnapshot(),blob=new Blob([JSON.stringify(data)],{type:'application/json'}),name=pdfName('身仕度').replace(/\.pdf$/i,'_編集データ.json');
    backupFile=typeof File==='function'?new File([blob],name,{type:'application/json'}):null;
    if(backupUrl)URL.revokeObjectURL(backupUrl);backupUrl=URL.createObjectURL(blob);$('download-backup').href=backupUrl;$('download-backup').download=name;
    let canShare=false;try{canShare=!!(backupFile&&navigator.share&&navigator.canShare?.({files:[backupFile]}));}catch{}
    $('share-backup').hidden=!canShare;$('backup-info').textContent=name+' · 原稿・画像・並び順・設定'+(customFont?'・読み込んだフォント':'');$('backup-area').hidden=false;
    message('編集データを作りました。下の共有またはダウンロードから保存してください。');
  }catch(error){message('編集データを作れませんでした。'+error.message,true);}
});
$('share-backup').addEventListener('click',async()=>{
  if(!backupFile||sharing)return;sharing=true;$('share-backup').disabled=true;
  try{await navigator.share({files:[backupFile]});message('共有画面を閉じました。保存先で編集データを確認してください。');}
  catch(error){message(error.name==='AbortError'?'保存をキャンセルしました。':'共有できませんでした。編集データをダウンロードして保存してください。',error.name!=='AbortError');}
  finally{sharing=false;$('share-backup').disabled=false;}
});
$('import-project').addEventListener('click',()=>{if(!busy){$('project-file').value='';$('project-file').click();}});
$('project-file').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file||busy)return;
  setBusy(true);
  try{
    if(file.size>250*1024*1024)throw new Error('編集データは250MB以下にしてください。');
    const data=validateProject(JSON.parse(await file.text()));
    if(!window.confirm('現在の編集内容を、このファイルの内容に置き換えますか？必要な原稿は先に編集データとして保存してください。'))return;
    await flushDraft();await restoreProject(data);draftReady=true;scheduleDraft();await flushDraft();message('編集データを読み込みました。「並び順で確認」で誌面を確認してください。');
  }catch(error){message('読み込めませんでした。'+error.message,true);}finally{setBusy(false);}
});
window.addEventListener('beforeunload',event=>{if(draftDirty){flushDraft();event.preventDefault();event.returnValue='';}});
window.addEventListener('pagehide',()=>flushDraft());
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushDraft();});
async function init(){
  setBusy(true);let saved=null,storageError=false;
  try{saved=await readDraft();}catch{storageError=true;}
  try{
    if(saved){await restoreProject(saved);$('draft-status').textContent='保存した下書きを復元しました。';message('前回の編集内容を復元しました。');}
    else{const response=await fetch('assets/ZenOldMincho-Regular.ttf');if(!response.ok)throw new Error('フォントを読み込めませんでした。');await loadFont(await response.arrayBuffer(),'ZENオールド明朝');$('draft-status').textContent=storageError?'自動保存を使えません。編集データを書き出して保存してください。':'編集すると、この端末に下書きを自動保存します。';message('原稿を入れて「縦書きで確認」を押してください。');}
    draftReady=true;
  }catch(error){$('draft-status').textContent='下書きの読み込みに失敗しました。再読み込みしてお試しください。';message(error.message,true);}
  finally{setBusy(false);}
}
const modelContext=document.modelContext;
if(modelContext?.registerTool){
  const lifecycle=new AbortController();
  const tools=[{
    name:'set_manuscript_and_preview',title:'原稿を入れて組版する',description:'タイトル・作者・本文を画面に入力し、縦書きプレビューを更新する。PDF保存は行わない。',
    inputSchema:{type:'object',properties:{title:{type:'string',maxLength:54},author:{type:'string',maxLength:18},body:{type:'string',minLength:1,maxLength:50000}},required:['title','author','body'],additionalProperties:false},
    annotations:{readOnlyHint:false,untrustedContentHint:true},
    execute(input){if(busy||!font)throw new Error('フォントの準備中です。');if(selectedItem()?.kind!=='text')throw new Error('本文の編集画面を選んでください。');if(!input||typeof input.title!=='string'||typeof input.author!=='string'||typeof input.body!=='string')throw new Error('タイトル・作者・本文を文字列で指定してください。');const next=paginate(input);const missing=missingCharacters(next,font);if(missing.length)throw new Error('フォントにない文字があります。');for(const id of ['title','author','body'])$(id).value=input[id];invalidate();const result=typeset();if(!result)throw new Error($('status').textContent);return {pages:result.pages.length,title:result.title};}
  },{
    name:'read_typesetting_status',title:'組版の状態を確認する',description:'現在のプレビューのページ数と表示位置を確認する。原稿を変更しない。',
    inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},
    execute(){return {ready:!!font,hasPreview:!!proof,pages:proof?.pages.length||0,currentPage:proof?currentPage+1:0,items:items.map(i=>({id:i.id,kind:i.kind,title:i.title})),selectedId};}
  }];
  for(const tool of tools){try{Promise.resolve(modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
renderEditor();renderList();init();
