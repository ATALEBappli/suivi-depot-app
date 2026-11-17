// Adapte Request/Response au contrat minimal du coeur Node, sans serveur TCP.
export async function handle(application,request){
 const headers=Object.fromEntries(request.headers),url=new URL(request.url);
 const req={method:request.method,url:url.pathname+url.search,headers,async *[Symbol.asyncIterator](){if(request.body)for await(const chunk of request.body)yield chunk;}};
 let status=200,body='',out=new Headers();
 const res={setHeader(k,v){out.set(k,v);},writeHead(s,h={}){status=s;for(const[k,v]of Object.entries(h))out.set(k,v);},end(b=''){body=b;}};
 await application(req,res);return new Response([204,304].includes(status)?null:body,{status,headers:out});
}
