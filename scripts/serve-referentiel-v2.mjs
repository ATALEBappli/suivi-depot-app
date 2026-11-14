import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {runtime} from './v2-local-runtime.mjs';
const r=runtime();
const allowed={'/':['referentiel-v2.html','text/html; charset=utf-8'],'/referentiel-v2.css':['referentiel-v2.css','text/css'],'/referentiel-v2.js':['referentiel-v2.js','text/javascript']};
const port=Number(process.env.V2_PORT || 4175);
createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options','nosniff');
  try {
    if(req.url==='/api/v2' && req.method==='POST') {
      if(req.headers.origin && req.headers.origin!==`http://127.0.0.1:${port}` && req.headers.origin!==`http://localhost:${port}`)throw Error('INVALID_ORIGIN');
      if(req.headers['content-type']!=='application/json')throw Error('INVALID_CONTENT_TYPE');
      let content='';for await(const chunk of req){content+=chunk;if(content.length>1000000)throw Error('TOO_LARGE');}
      const out=r.api.v2Client(JSON.parse(content));res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(out));return;
    }
    const file=allowed[req.url];if(req.method!=='GET' || !file){res.writeHead(404);res.end('Introuvable');return;}
    res.writeHead(200,{'Content-Type':file[1]});res.end(readFileSync(file[0]));
  }catch{res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'LOCAL_REQUEST_FAILED'}));}
}).listen(port,'127.0.0.1',()=>console.log(`US-015 local fictif : http://127.0.0.1:${port} — mémoire effacée à l’arrêt, aucun réseau Google.`));
