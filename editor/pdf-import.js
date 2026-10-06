import {bytesToBase64,base64ToBytes} from './storage.js?v=16';
let resources;
async function resource(name){
  if(!resources)resources=fetch(new URL('./assets/pdf-resources.json',import.meta.url)).then(r=>{if(!r.ok)throw new Error('PDF用フォントを読み込めませんでした。');return r.json();}).catch(e=>{resources=null;throw e;});
  const data=(await resources)[name];if(!data)throw new Error('PDF用フォントが見つかりません。');return base64ToBytes(data);
}
class CMapReaderFactory{async fetch({name}){return {cMapData:await resource(name+'.bcmap'),isCompressed:true};}}
class StandardFontDataFactory{async fetch({filename}){return resource(filename);}}

// Keep the submitted bytes for vector PDF export; JPEGs are only proof/WebP assets.
export async function readPdfFile(file,onProgress=()=>{}){
  if(file.size>25*1024*1024)throw new Error('PDFは1作品25MB以下にしてください。');
  const bytes=new Uint8Array(await file.arrayBuffer());
  let source;
  try{source=await window.PDFLib.PDFDocument.load(bytes);}catch{throw new Error('PDFを開けません。パスワードのないPDFで提出してください。');}
  if(source.getPageCount()>100)throw new Error('PDFは1作品100ページ以内にしてください。');
  const pdfjs=await import('./assets/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc=new URL('./assets/pdf.worker.mjs',import.meta.url).href;
  const task=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,useSystemFonts:true,useWorkerFetch:false,CMapReaderFactory,StandardFontDataFactory,wasmUrl:new URL('./assets/',import.meta.url).href});
  task.onPassword=()=>task.destroy();
  let doc;const pages=[];let previewSize=0;
  try{
    doc=await task.promise;
    for(let n=1;n<=doc.numPages;n++){
      onProgress(n,doc.numPages);
      const page=await doc.getPage(n),original=page.getViewport({scale:1});
      const viewport=page.getViewport({scale:2400/Math.max(original.width,original.height)});
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.floor(viewport.width));canvas.height=Math.max(1,Math.floor(viewport.height));
      try{
        const ctx=canvas.getContext('2d');if(!ctx)throw new Error('PDFのプレビューを作れませんでした。');
        await page.render({canvasContext:ctx,viewport,background:'rgb(255,255,255)'}).promise;
        const data=canvas.toDataURL('image/jpeg',.96);previewSize+=data.length;
        if(previewSize>100*1024*1024)throw new Error('PDFの画像が大きすぎます。作品を分割して追加してください。');
        const annotations=await page.getAnnotations({intent:'display'});
        pages.push({data,width:canvas.width,height:canvas.height,name:`${file.name} (${n})`,raster:!source.getPage(n-1).node.Contents()||annotations.some(a=>a.annotationType!==2)});
      }finally{canvas.width=canvas.height=0;page.cleanup();}
    }
    return {name:file.name,data:bytesToBase64(bytes),pages};
  }finally{if(doc)await doc.destroy();else await task.destroy();}
}
