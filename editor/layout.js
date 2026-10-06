import {readerLogo} from './reader-logo.js?v=16';
export const SPEC = Object.freeze({width:768.24,height:1086.236,rows:36,columns:15,bodySize:22,titleSize:26,pitch:22.44,linePitch:38,top:127.556,oddRight:643.151,evenRight:671.497});
const NO_START = new Set(Array.from('、。，．・：；？！‼⁇⁈⁉）)]｝}〕〉》」』】〙〗〟’”｠»ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶー〜～…‥'));
const NO_END = new Set(Array.from('（([｛{〔〈《「『【〘〖〝‘“｟«'));
const graphemeSplitter = typeof Intl.Segmenter==='function' ? new Intl.Segmenter('ja',{granularity:'grapheme'}) : null;
export function graphemes(text){return graphemeSplitter?Array.from(graphemeSplitter.segment(text),x=>x.segment):Array.from(text);}
export function normalizeBody(text){return text.replace(/\r\n?|[\u2028\u2029\u0085]/g,'\n').replace(/\u00a0/g,' ').replace(/\t/g,'　').normalize('NFC');}
const narrow=s=>s.replace(/[！-～]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0));
export function textUnits(text,{combineDigits=true,markup=true}={}){
  const chars=graphemes(text),units=[];
  for(let i=0;i<chars.length;){
    if(markup&&chars[i]==='['&&chars[i+1]==='['){
      let end=i+2;while(end<chars.length&&!(chars[end]===']'&&chars[end+1]===']'))end++;
      if(end===chars.length)throw new Error('組文字の指定が閉じていません。[[12]]のように囲んでください。');
      const selected=chars.slice(i+2,end);
      if(!selected.length||selected.length>4||selected.some(c=>/\s|\[|\]/u.test(c)))throw new Error('組文字には、空白や改行を含まない1〜4文字を指定してください。');
      const original=selected.join('');units.push({text:original,display:narrow(original),kind:'tcy'});i=end+2;continue;
    }
    if(/^[0-9０-９]$/u.test(chars[i])){
      let end=i+1;while(end<chars.length&&/^[0-9０-９]$/u.test(chars[end]))end++;
      const digits=chars.slice(i,end).join('');
      if(combineDigits&&end-i===2)units.push({text:digits,display:narrow(digits),kind:'tcy'});
      else for(const digit of chars.slice(i,end))units.push({text:digit,display:digit,kind:'upright'});
      i=end;continue;
    }
    if(/^[!?！？]$/u.test(chars[i])){
      let end=i+1;while(end<chars.length&&/^[!?！？]$/u.test(chars[end]))end++;
      if(end-i===2){const pair=chars.slice(i,end).join('');units.push({text:pair,display:narrow(pair),kind:'tcy'});}
      else for(const c of chars.slice(i,end))units.push({text:c,display:c,kind:'upright'});
      i=end;continue;
    }
    units.push({text:chars[i],display:chars[i],kind:'normal'});i++;
  }
  return units;
}
export function breakLines(text,indent=true,combineDigits=true,rows=SPEC.rows){
  const lines=[];
  const paragraphs=normalizeBody(text).split('\n');
  while(paragraphs.length>1&&paragraphs.at(-1)==='')paragraphs.pop();
  for(const paragraph of paragraphs){
    if(!paragraph.trim()){lines.push([]);continue;}
    let chars=textUnits(paragraph,{combineDigits});
    if(indent&&!/^[ 　]/u.test(paragraph))chars.unshift({text:'　',display:'　',kind:'normal'});
    while(chars.length){
      let end=Math.min(rows,chars.length);
      if(end<chars.length){
        while(end>1&&(NO_END.has(chars[end-1].text.at(-1))||NO_START.has(chars[end].text[0])))end--;
      }
      lines.push(chars.slice(0,end));chars=chars.slice(end);
    }
  }
  return lines;
}
export function paginate({title='',author='',body='',indent=true,startSide='odd',combineDigits=true}){
  title=title.trim().normalize('NFC');author=author.trim().normalize('NFC');
  if(!body.trim())throw new Error('本文を入力してください。');
  if(graphemes(body).length>50000)throw new Error('本文は50,000字までにしてください。');
  if(prefaceLength(title)>54)throw new Error('作品タイトルは54字までにしてください。');
  if(prefaceLength(author)>18)throw new Error('作者名は18字までにしてください。');
  const titleChars=textUnits(title,{combineDigits}),authorChars=textUnits(author,{combineDigits});
  const titleColumns=titleChars.length?Math.ceil(titleChars.length/27):0;
  const firstReserve=title||author?Math.max(titleColumns,1)+2:0;
  const lines=breakLines(body,indent,combineDigits);
  const pages=[];let cursor=0;
  while(cursor<lines.length){
    const index=pages.length,offset=index===0?firstReserve:0;
    const count=SPEC.columns-offset;
    const pageLines=lines.slice(cursor,cursor+count);cursor+=pageLines.length;
    const odd=(index+(startSide==='even'?1:0))%2===0;
    const right=odd?SPEC.oddRight:SPEC.evenRight;
    const cells=[];
    pageLines.forEach((line,col)=>line.forEach((unit,row)=>cells.push({char:unit.display,source:unit.text,kind:unit.kind,x:right-(col+offset)*SPEC.linePitch-SPEC.bodySize/2,y:SPEC.top+row*SPEC.pitch,size:SPEC.bodySize,role:'body'})));
    if(index===0){
      titleChars.forEach((unit,n)=>cells.push({char:unit.display,source:unit.text,kind:unit.kind,x:right-Math.floor(n/27)*SPEC.linePitch-13,y:184.249+(n%27)*26,size:26,role:'title'}));
      const authorX=right-25.8-(titleColumns>1?SPEC.linePitch:0);
      authorChars.forEach((unit,n)=>cells.push({char:unit.display,source:unit.text,kind:unit.kind,x:authorX-11,y:873.635-authorChars.length*22+n*22,size:22,role:'author'}));
    }
    pages.push({cells,lines:pageLines,offset,index,side:odd?'odd':'even'});
  }
  return {title,author,body:normalizeBody(body),indent,startSide,combineDigits,pages,characterCount:lines.flat().reduce((n,u)=>n+graphemes(u.text.replace(/\s/g,'')).length,0)};
}
export function paginateAfterword({title='あとがき',author='',body='',indent=true,startSide='odd',combineDigits=true}){
  title=title.trim().normalize('NFC')||'あとがき';author=author.trim().normalize('NFC');
  if(!body.trim())throw new Error('あとがきの本文を入力してください。');
  if(graphemes(body).length>50000)throw new Error('本文は50,000字までにしてください。');
  if(prefaceLength(title)>18)throw new Error('あとがきの見出しは18字までにしてください。');
  if(prefaceLength(author)>18)throw new Error('作者名は18字までにしてください。');
  const lines=breakLines(body,indent,combineDigits,44),pages=[];
  const heading=textUnits(title,{combineDigits}),name=textUnits(author,{combineDigits});
  for(let cursor=0;cursor<lines.length;cursor+=8){
    const index=pages.length,cells=[],pageLines=lines.slice(cursor,cursor+8);
    pageLines.forEach((line,col)=>line.forEach((unit,row)=>cells.push({char:unit.display,source:unit.text,kind:unit.kind,x:500-col*38,y:130+row*18.5,size:20,role:'body'})));
    heading.forEach((unit,n)=>cells.push({char:unit.display,source:unit.text,kind:unit.kind,x:586,y:186+n*24,size:24,role:'title'}));
    if(cursor+8>=lines.length)name.forEach((unit,n)=>cells.push({char:unit.display,source:unit.text,kind:unit.kind,x:500-(pageLines.length+1)*38,y:876-name.length*22+n*22,size:22,role:'author'}));
    pages.push({cells,lines:pageLines,index,side:(index+(startSide==='even'?1:0))%2?'even':'odd',layout:'afterword'});
  }
  return {title,author,body:normalizeBody(body),indent,startSide,combineDigits,pages};
}
export function prefaceLength(text){return graphemes(normalizeBody(text).replace(/\[\[([^\n]*?)\]\]/g,'$1').replace(/\n/g,'')).length;}
export function paginateReader({title='',author='',body='',preface='',indent=true,startSide='odd',combineDigits=true}){
  title=title.trim().normalize('NFC');author=author.trim().normalize('NFC');
  if(!title)throw new Error('読者寄稿のタイトルを入力してください。');
  if(!author)throw new Error('読者寄稿の作者名を入力してください。');
  if(!body.trim())throw new Error('読者寄稿の本文を入力してください。');
  if(prefaceLength(title)>27)throw new Error('読者寄稿のタイトルは27字までにしてください。');
  if(prefaceLength(author)>18)throw new Error('作者名は18字までにしてください。');
  if(graphemes(body).length>50000)throw new Error('本文は50,000字までにしてください。');
  if(prefaceLength(preface)>150)throw new Error('前書きは150文字までにしてください。');
  const intro=breakLines(preface,false,combineDigits,32);
  if(intro.length>5)throw new Error('前書きの改行・空行を減らして、5行以内に収めてください。');
  const lines=breakLines(body,indent,combineDigits),pages=[];
  const add=(cells,unit,x,y,size,role)=>cells.push({char:unit.display,source:unit.text,kind:unit.kind,x,y,size,role});
  for(let cursor=0;cursor<lines.length;){
    const index=pages.length,first=index===0,odd=(index+(startSide==='even'?1:0))%2===0;
    const pageLines=lines.slice(cursor,cursor+(first?7:SPEC.columns));cursor+=pageLines.length;
    const cells=[],right=first?330:(odd?SPEC.oddRight:SPEC.evenRight);
    pageLines.forEach((line,col)=>line.forEach((u,row)=>add(cells,u,right-col*SPEC.linePitch-SPEC.bodySize/2,SPEC.top+row*SPEC.pitch,SPEC.bodySize,'body')));
    const page={cells,lines:pageLines,index,side:odd?'odd':'even',layout:'reader'};
    if(first){
      textUnits(title,{combineDigits}).forEach((u,n)=>add(cells,u,422,184+n*26,26,'title'));
      const name=textUnits(author,{combineDigits});name.forEach((u,n)=>add(cells,u,400,873.635-name.length*22+n*22,22,'author'));
      textUnits('まえがき',{markup:false}).forEach((u,n)=>add(cells,u,533+n*30,343,16,'preface-heading'));
      intro.forEach((line,col)=>line.forEach((u,row)=>add(cells,u,636-col*25,382+row*17,16,'preface')));
      page.images=[{data:readerLogo,x:510,y:128,width:176,height:176}];
      page.rules=[{x:518,y:368,width:136,height:1.5,color:'#487e42'}];
    }
    pages.push(page);
  }
  return {title,author,body:normalizeBody(body),preface,indent,startSide,combineDigits,pages};
}
export function paginateToc({entries=[]}){
  const rows=entries.filter(e=>e.title?.trim()||e.author?.trim());
  if(!rows.length)throw new Error('目次に作品タイトルを入力してください。');
  if(rows.length>10)throw new Error('目次は、あとがきを含めて10項目までです。');
  const cells=[],top=235,bottom=824,pitch=Math.min(48,480/Math.max(1,rows.length-1));
  const add=(u,x,y,size,role)=>cells.push({char:u.display,source:u.text,kind:u.kind,x,y,size,role});
  textUnits('目次').forEach((u,n)=>add(u,654,264+n*26,26,'toc-heading'));
  rows.forEach((entry,index)=>{
    if(!entry.title?.trim())throw new Error(`目次の${index+1}番目にタイトルを入力してください。`);
    const title=textUnits(entry.title.trim().normalize('NFC')),author=textUnits((entry.author||'').trim().normalize('NFC'));
    if(title.length>54||author.length>18)throw new Error('目次のタイトルは54字、作者名は18字までにしてください。');
    const x=596-index*pitch,authorTop=bottom-author.length*22;
    const label=entry.reader&&author.length?textUnits('読者寄稿'):[];
    const labelTop=authorTop-18-label.length*14;
    const available=(label.length?labelTop:author.length?authorTop:bottom)-top-24;
    const titleSize=Math.min(22,available/Math.max(1,title.length));
    if(titleSize<14)throw new Error(`「${entry.title}」は目次の縦1列に収まりません。目次用のタイトルを短くしてください。`);
    title.forEach((u,n)=>add(u,x+(22-titleSize)/2,top+n*titleSize,titleSize,'toc-title'));
    author.forEach((u,n)=>add(u,x,authorTop+n*22,22,'toc-author'));
    label.forEach((u,n)=>add(u,x+4,labelTop+n*14,14,'toc-reader'));
  });
  return {title:'目次',author:'',pages:[{cells,index:0,layout:'toc'}]};
}
export function isSideways(char){return !/^[0-9０-９!?！？]+$/u.test(char)&&/^[\u0021-\u007e\u00a1-\u024f]/u.test(char);}
const HORIZONTAL_FEATURES={kern:false,liga:false,clig:false};
export function glyphRun(font,char,horizontal=false){return font.layout(char,horizontal?HORIZONTAL_FEATURES:['vert','vrt2']);}
export function glyphPosition(font,cell){
  const combined=cell.kind==='tcy';
  const sideways=!combined&&cell.kind!=='upright'&&isSideways(cell.char),run=glyphRun(font,cell.char,combined||sideways);
  let fontSize=cell.size;
  const advance=run.positions.reduce((n,p)=>n+p.xAdvance,0);
  if(combined)fontSize*=Math.min(1, font.unitsPerEm/Math.max(advance,1));
  const scale=fontSize/font.unitsPerEm;
  const width=run.positions.reduce((n,p)=>n+p.xAdvance,0)*scale;
  const pad=(cell.size-width)/2;
  let baseline=cell.y+cell.size*.88;
  if(combined){
    const minY=Math.min(...run.glyphs.map((g,i)=>g.bbox.minY+run.positions[i].yOffset));
    const maxY=Math.max(...run.glyphs.map((g,i)=>g.bbox.maxY+run.positions[i].yOffset));
    if(Number.isFinite(minY)&&Number.isFinite(maxY))baseline=cell.y+cell.size/2+(minY+maxY)*scale/2;
  }
  return {sideways,combined,run,scale,pad,baseline,fontSize};
}
const xml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function pageSvg(page,font,{grid=false,label='誌面プレビュー'}={}){
  const definitions=new Map();const uses=[];
  for(const cell of page.cells){
    const {sideways,run,scale,pad,baseline}=glyphPosition(font,cell);
    let pen=0;const parts=[];
    run.glyphs.forEach((g,i)=>{
      if(!definitions.has(g.id))definitions.set(g.id,g.path.toSVG());
      const p=run.positions[i];
      parts.push(`<use href="#g${g.id}" transform="translate(${cell.x+pad+(pen+p.xOffset)*scale} ${baseline-p.yOffset*scale}) scale(${scale} ${-scale})"/>`);
      pen+=p.xAdvance;
    });
    uses.push(sideways?`<g transform="rotate(90 ${cell.x+cell.size/2} ${cell.y+cell.size/2})">${parts.join('')}</g>`:parts.join(''));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SPEC.width} ${SPEC.height}" role="img" aria-label="${xml(label)}"><title>${xml(label)}</title><rect width="100%" height="100%" fill="white"/><defs>${Array.from(definitions,([id,d])=>`<path id="g${id}" d="${xml(d)}"/>`).join('')}</defs><g fill="#111111">${uses.join('')}</g>${(page.images||[]).map(r=>`<image href="${r.data}" x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}"/>`).join('')}${(page.rules||[]).map(r=>`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${r.color}"/>`).join('')}</svg>`;
}
export function missingCharacters(doc,font){
  return Array.from(new Set(doc.pages.flatMap(p=>p.cells).filter(c=>glyphPosition(font,c).run.glyphs.some(g=>g.id===0)).map(c=>c.source||c.char)));
}
export async function createPdf(doc,fontBytes,font,fontkit,PDFLib,onProgress=()=>{}){
  const {PDFDocument,rgb,degrees}=PDFLib;
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const hasText=doc.pages.some(p=>p.kind!=='image');
  const verticalFont=hasText?await pdf.embedFont(fontBytes,{subset:false,features:['vert','vrt2']}):null;
  const horizontalFont=hasText?await pdf.embedFont(fontBytes,{subset:false,features:HORIZONTAL_FEATURES}):null;
  pdf.setTitle(doc.title||'身仕度');pdf.setAuthor(doc.author||'');pdf.setCreator('身仕度 組版室 v0.3');pdf.setSubject('月刊身仕度');
  const sources=new Map();
  for(const page of doc.pages){
    const out=pdf.addPage([SPEC.width,SPEC.height]);
    if(page.pdfSource&&!page.image.raster){
      if(!sources.has(page.pdfSource))sources.set(page.pdfSource,await PDFDocument.load(page.pdfSource.data));
      const original=sources.get(page.pdfSource).getPage(page.pdfIndex),box=original.getCropBox();
      const embedded=await pdf.embedPage(original,{left:box.x,bottom:box.y,right:box.x+box.width,top:box.y+box.height});
      const rotation=((original.getRotation().angle%360)+360)%360,turned=rotation===90||rotation===270;
      const w=turned?box.height:box.width,h=turned?box.width:box.height,s=Math.min(SPEC.width/w,SPEC.height/h);
      const x=(SPEC.width-w*s)/2,y=(SPEC.height-h*s)/2;
      out.drawPage(embedded,{x:x+(rotation===180||rotation===270?w*s:0),y:y+(rotation===90||rotation===180?h*s:0),width:box.width*s,height:box.height*s,rotate:degrees(-rotation)});
    }else if(page.kind==='image'){
      const img=await pdf.embedJpg(page.image.data),r=page.placement;
      out.drawImage(img,{x:r.x,y:SPEC.height-r.y-r.height,width:r.width,height:r.height});
    }
    for(const r of page.images||[]){const img=await pdf.embedJpg(r.data);out.drawImage(img,{x:r.x,y:SPEC.height-r.y-r.height,width:r.width,height:r.height});}
    for(const r of page.rules||[])out.drawRectangle({x:r.x,y:SPEC.height-r.y-r.height,width:r.width,height:r.height,color:rgb(...[1,3,5].map(i=>parseInt(r.color.slice(i,i+2),16)/255))});
    for(const cell of page.cells||[]){
      const pos=glyphPosition(font,cell);
      out.drawText(cell.char,{font:pos.sideways||pos.combined?horizontalFont:verticalFont,size:pos.fontSize,color:rgb(.067,.067,.067),x:pos.sideways?cell.x+cell.size*.12:cell.x+pos.pad,y:pos.sideways?SPEC.height-cell.y-pos.pad:SPEC.height-pos.baseline,rotate:degrees(pos.sideways?-90:0)});
    }
    onProgress(page.index+1,doc.pages.length);
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  return pdf.save();
}
