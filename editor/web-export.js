import {SPEC,glyphPosition} from './layout.js?v=14';
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
export function pageFilename(index){return `p-${String(index+1).padStart(2,'0')}.webp`;}
// ZIP stored entries: WebP is already compressed.
export function makeZip(files){
  const local=[],central=[];let offset=0,centralSize=0;
  for(const file of files){
    const name=new TextEncoder().encode(file.name),data=file.data,crc=crc32(data);
    const header=new Uint8Array(30+name.length),v=new DataView(header.buffer);
    v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);header.set(name,30);
    const entry=new Uint8Array(46+name.length),c=new DataView(entry.buffer);
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,33,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);entry.set(name,46);
    local.push(header,data);central.push(entry);offset+=header.length+data.length;centralSize+=entry.length;
  }
  const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
  return new Blob([...local,...central,end],{type:'application/zip'});
}
export async function renderWebp(page,font){
  const width=1600,height=Math.round(width*SPEC.height/SPEC.width);
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  try{
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('このブラウザで画像を作れませんでした。');
    ctx.fillStyle='white';ctx.fillRect(0,0,width,height);
    ctx.scale(width/SPEC.width,height/SPEC.height);
    if(page.kind==='image'){
      const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('画像を読み込めませんでした。'));img.src=page.image.data;});
      const r=page.placement;ctx.drawImage(img,r.x,r.y,r.width,r.height);
    }else{
      ctx.fillStyle='#111111';
      for(const cell of page.cells){
        const {sideways,run,scale,pad,baseline}=glyphPosition(font,cell);
        ctx.save();
        if(sideways){const x=cell.x+cell.size/2,y=cell.y+cell.size/2;ctx.translate(x,y);ctx.rotate(Math.PI/2);ctx.translate(-x,-y);}
        let pen=0;
        run.glyphs.forEach((glyph,i)=>{const p=run.positions[i];ctx.save();ctx.translate(cell.x+pad+(pen+p.xOffset)*scale,baseline-p.yOffset*scale);ctx.scale(scale,-scale);ctx.fill(new Path2D(glyph.path.toSVG()));ctx.restore();pen+=p.xAdvance;});
        ctx.restore();
      }
    }
    for(const r of page.images||[]){
      const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('ロゴを読み込めませんでした。'));img.src=r.data;});
      ctx.drawImage(img,r.x,r.y,r.width,r.height);
    }
    for(const r of page.rules||[]){ctx.fillStyle=r.color;ctx.fillRect(r.x,r.y,r.width,r.height);}
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.92));
    if(blob?.type==='image/webp')return new Uint8Array(await blob.arrayBuffer());
    const {encodeWebp}=await import('./webp-fallback.js?v=14');
    return new Uint8Array(await encodeWebp(ctx.getImageData(0,0,width,height)));
  }finally{canvas.width=canvas.height=1;}
}
export async function createWebZip(doc,font,onProgress=()=>{},check=()=>{}){
  const files=[];let total=0;
  for(let i=0;i<doc.pages.length;i++){
    check();const data=await renderWebp(doc.pages[i],font);check();total+=data.length;
    if(total>200*1024*1024)throw new Error('画像の合計が200MBを超えました。ページ数を減らして作成してください。');
    files.push({name:pageFilename(i),data});onProgress(i+1,doc.pages.length);
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  return makeZip(files);
}
