import assert from 'node:assert/strict';

// Probe through the image's own Node runtime. An internal Docker network does not
// need (and on some engines does not create) host-published port bindings.
// Redirects fail unless `redirect: 'manual'` asks for the redirect response itself.
export async function containerHttp(docker, container, route, { timeoutMs = 5000, port = 3000, redirect = 'error' } = {}) {
  assert(typeof route === 'string' && route.startsWith('/') && !route.startsWith('//'));
  assert(Number.isInteger(port) && port > 0 && port <= 65535);
  assert(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 15000);
  assert(redirect === 'error' || redirect === 'manual');
  const output = await docker([
    'exec', container, 'node', '-e',
    `
    (async()=>{
      const response=await fetch(${JSON.stringify(`http://127.0.0.1:${port}${route}`)}, {
        signal:AbortSignal.timeout(${timeoutMs}), redirect:${JSON.stringify(redirect)}
      });
      const chunks=[];let size=0;
      for await(const chunk of response.body??[]){
        size+=chunk.length;if(size>2*1024*1024)throw Error('HTTP probe response exceeds 2 MiB');
        chunks.push(chunk);
      }
      console.log(JSON.stringify({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.concat(chunks).toString('base64')}));
    })().catch(error=>{console.error(String(error.message).slice(0,200));process.exit(1)});
    `,
  ]);
  const result = JSON.parse(output);
  return new Response(Buffer.from(result.body, 'base64'), {
    status: result.status,
    headers: result.headers,
  });
}
