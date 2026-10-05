import factory from './assets/webp/webp_enc.js';
import {defaultOptions} from './assets/webp/meta.js';
let encoder;
export async function encodeWebp(image){
  encoder??=factory({noInitialRun:true});
  const module=await encoder;
  const result=module.encode(image.data,image.width,image.height,{...defaultOptions,quality:92});
  if(!result)throw new Error('WebP画像を作れませんでした。');
  return result.buffer;
}
