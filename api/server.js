import http from 'node:http';

const PORT = process.env.PORT || 10000;
const ALLOWED_ORIGIN = 'https://jobpilot-natanael.onrender.com';
const cache = new Map();

const areas = {
  LOGISTICA: ['"Assistente de Logística"','"Assistente Logístico"','"Auxiliar de Logística"','"Assistente de Transportes"','"Auxiliar de Expedição"'],
  ADMINISTRATIVO: ['"Assistente Administrativo"','"Auxiliar Administrativo"','"Assistente de Escritório"'],
  RH_DP: ['"Assistente de RH"','"Assistente de Recursos Humanos"','"Auxiliar de RH"','"Assistente de Departamento Pessoal"','"Auxiliar de Departamento Pessoal"']
};
const cities = ['Serra','Vitória','Vila Velha'];
const blockedTitle = /(est[aá]gio|estagi[aá]rio|jovem aprendiz|aprendiz|trainee|vendedor|consultor comercial|executivo comercial|supervisor|coordenador|gerente|analista)/i;
const sourceDomains = /(gupy\.io|abler\.in|vagas\.com\.br|solutudo\.com\.br|jobijoba\.com\.br|jooble\.org|empregare\.com|indeed\.com|linkedin\.com\/jobs)/i;

function decodeXml(s='') {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
    .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>');
}
function stripHtml(s='') { return decodeXml(s).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim(); }
function tag(block,name) {
  const m = block.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'));
  return m ? stripHtml(m[1]) : '';
}
function sourceName(url='') {
  if (/gupy\.io/i.test(url)) return 'Gupy';
  if (/abler\.in/i.test(url)) return 'Abler';
  if (/vagas\.com\.br/i.test(url)) return 'Vagas.com.br';
  if (/solutudo\.com\.br/i.test(url)) return 'Solutudo';
  if (/jobijoba\.com\.br/i.test(url)) return 'Jobijoba';
  if (/jooble\.org/i.test(url)) return 'Jooble';
  if (/empregare\.com/i.test(url)) return 'Empregare';
  if (/indeed\.com/i.test(url)) return 'Indeed';
  if (/linkedin\.com/i.test(url)) return 'LinkedIn';
  try { return new URL(url).hostname.replace(/^www\./,''); } catch { return 'Web'; }
}
function splitTitle(raw='') {
  let clean = raw.replace(/\s+[-|]\s+(Gupy|Indeed|LinkedIn|Vagas\.com\.br|Jooble).*$/i,'').trim();
  const parts = clean.split(/\s+[|–—-]\s+/).map(x=>x.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0], last = parts[parts.length-1];
    if (/assistente|auxiliar/i.test(first)) return {title:first, company:last};
    if (/assistente|auxiliar/i.test(last)) return {title:last, company:first};
  }
  return {title:clean, company:'Empresa não identificada'};
}
async function bingRss(query) {
  const u = 'https://www.bing.com/search?format=rss&count=15&q=' + encodeURIComponent(query);
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), 9000);
  try {
    const r = await fetch(u,{headers:{'user-agent':'Mozilla/5.0 JobPilot/1.0','accept':'application/rss+xml,application/xml,text/xml'},signal:controller.signal});
    if (!r.ok) throw new Error('bing '+r.status);
    const xml = await r.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(m=>({
      rawTitle:tag(m[1],'title'),
      url:tag(m[1],'link'),
      description:tag(m[1],'description'),
      publishedAt:tag(m[1],'pubDate')
    }));
  } finally { clearTimeout(timer); }
}
async function searchJobs() {
  const jobs = [];
  const tasks = [];
  for (const [area,terms] of Object.entries(areas)) {
    for (const city of cities) {
      const q = '('+terms.join(' OR ')+') "'+city+'" "ES" vagas emprego';
      tasks.push({area,city,q});
    }
  }
  const results = await Promise.allSettled(tasks.map(t=>bingRss(t.q)));
  results.forEach((res,i)=>{
    if (res.status !== 'fulfilled') return;
    const {area,city} = tasks[i];
    for (const it of res.value) {
      if (!it.url || blockedTitle.test(it.rawTitle)) continue;
      const text=(it.rawTitle+' '+it.description).toLowerCase();
      if (!/assistente|auxiliar/.test(text)) continue;
      const {title,company}=splitTitle(it.rawTitle);
      jobs.push({
        title, company, city, area,
        url:it.url,
        source:sourceName(it.url),
        description:it.description,
        publishedAt:it.publishedAt || null,
        indexedSource: sourceDomains.test(it.url) ? 'job-board' : 'web'
      });
    }
  });
  const seen = new Set();
  return jobs.filter(j=>{
    const k=(j.url||'').replace(/[?#].*$/,'') || [j.title,j.company,j.city].join('|').toLowerCase();
    if (seen.has(k)) return false; seen.add(k); return true;
  }).slice(0,60);
}

const server = http.createServer(async (req,res)=>{
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url,'http://localhost');
  if (url.pathname === '/health') {
    res.writeHead(200,{'content-type':'application/json'});
    return res.end(JSON.stringify({ok:true,service:'jobpilot-search'}));
  }
  if (url.pathname !== '/search') {
    res.writeHead(404,{'content-type':'application/json'});
    return res.end(JSON.stringify({error:'not_found'}));
  }
  try {
    const key='default', hit=cache.get(key);
    if (hit && Date.now()-hit.at < 10*60*1000) {
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
      return res.end(JSON.stringify({jobs:hit.jobs,cached:true,generatedAt:new Date(hit.at).toISOString()}));
    }
    const jobs = await searchJobs();
    cache.set(key,{jobs,at:Date.now()});
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify({jobs,cached:false,generatedAt:new Date().toISOString()}));
  } catch (e) {
    console.error(e);
    res.writeHead(502,{'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify({error:'search_failed',message:String(e?.message||e)}));
  }
});
server.listen(PORT,()=>console.log('JobPilot search API listening on',PORT));
