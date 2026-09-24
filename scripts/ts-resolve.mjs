// Дозволяє node --experimental-strip-types імпортувати "./x" без розширення (як Next.js).
import {register} from "node:module";
register("data:text/javascript,"+encodeURIComponent(`
export async function resolve(spec,ctx,next){
  try{return await next(spec,ctx)}catch(e){
    if(e.code==="ERR_MODULE_NOT_FOUND"&&(spec.startsWith(".")||spec.startsWith("/"))&&!/\\.[a-z]+$/.test(spec))return next(spec+".ts",ctx);
    throw e;
  }
}`));
