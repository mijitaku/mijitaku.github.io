import {SPEC,paginate,paginateAfterword,paginateReader,paginateToc,missingCharacters} from './layout.js?v=16';

export function imagePlacement(width,height,fit='contain'){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('画像の大きさを読み取れませんでした。');
  const scale=fit==='cover'?Math.max(SPEC.width/width,SPEC.height/height):Math.min(SPEC.width/width,SPEC.height/height);
  const w=width*scale,h=height*scale;
  return {x:(SPEC.width-w)/2,y:(SPEC.height-h)/2,width:w,height:h};
}
export function buildBook(items,{font,startSide='odd',title='身仕度_まとめ'}={}){
  if(!items.length)throw new Error('本文か画像を追加してください。');
  const pages=[],sections=[];
  for(const [number,item] of items.entries()){
    const itemTitle=item.title?.trim()||(item.kind==='text'?'タイトル未入力':'画像ページ');
    const start=pages.length;
    if(item.kind==='text'||item.kind==='toc'){
      let doc;try{doc=(item.kind==='toc'?paginateToc:item.layout==='reader'?paginateReader:item.layout==='afterword'?paginateAfterword:paginate)({...item,startSide:(start+(startSide==='even'?1:0))%2?'even':'odd'});}catch(error){throw new Error(`${number+1}番目「${itemTitle}」：${error.message}`);}
      if(font){const missing=missingCharacters(doc,font);if(missing.length)throw new Error(`「${itemTitle}」のフォントにない文字：${missing.slice(0,12).join(' ')}。文字かフォントを変更してください。`);}
      for(const p of doc.pages)pages.push({...p,index:pages.length,itemId:item.id,itemTitle,itemPage:p.index+1});
    }else if(item.kind==='pdf'){
      if(!item.pdf?.pages?.length||!item.pdf.data)throw new Error(`「${itemTitle}」のPDFを選び直してください。`);
      item.pdf.pages.forEach((image,pdfIndex)=>pages.push({kind:'image',image,placement:imagePlacement(image.width,image.height),pdfSource:item.pdf,pdfIndex,cells:[],index:pages.length,itemId:item.id,itemTitle,itemPage:pdfIndex+1}));
    }else if(item.kind==='image'){
      if(!item.image?.data?.startsWith('data:image/jpeg;base64,'))throw new Error(`「${itemTitle}」の画像を選び直してください。`);
      const placement=imagePlacement(item.image.width,item.image.height,item.fit);
      pages.push({kind:'image',image:item.image,placement,cells:[],index:pages.length,itemId:item.id,itemTitle,itemPage:1});
    }else throw new Error('未対応のページです。');
    sections.push({id:item.id,title:itemTitle,start:start+1,count:pages.length-start,kind:item.kind});
    if(pages.length>300)throw new Error('この試作版では、まとめるページ数を300ページ以内にしてください。');
  }
  return {title:items.length===1?(items[0].title||'身仕度_本文'):title,author:Array.from(new Set(items.filter(i=>i.kind==='text').map(i=>i.author).filter(Boolean))).join('、'),pages,sections};
}
export function moveItem(items,id,direction){
  const result=[...items],index=result.findIndex(i=>i.id===id),next=index+direction;
  if(index<0||next<0||next>=result.length)return result;
  [result[index],result[next]]=[result[next],result[index]];return result;
}
export function imageSvg(page){
  const r=page.placement;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SPEC.width} ${SPEC.height}" role="img" aria-label="画像ページのプレビュー"><rect width="100%" height="100%" fill="white"/><image href="${page.image.data}" x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" preserveAspectRatio="none"/></svg>`;
}
export async function readImageFile(file){
  if(file.size>25*1024*1024)throw new Error('画像は1枚25MB以下にしてください。');
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('画像を開けませんでした。JPEG・PNG・WebPなどで選び直してください。'));image.src=url;});
    const scale=Math.min(1,2400/Math.max(image.naturalWidth,image.naturalHeight));
    const width=Math.max(1,Math.round(image.naturalWidth*scale)),height=Math.max(1,Math.round(image.naturalHeight*scale));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('この端末で画像を処理できませんでした。');
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);ctx.drawImage(image,0,0,width,height);
    return {data:canvas.toDataURL('image/jpeg',.94),width,height,name:file.name};
  }finally{URL.revokeObjectURL(url);}
}
