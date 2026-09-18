(() => {
'use strict';
const CFG=window.JOBPILOT_CONFIG;
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const LS={jobs:'jobpilot.jobs.v1',history:'jobpilot.history.v1',client:'jobpilot.clientId.v1'};
const SEARCH_API='https://jobpilot-search.onrender.com/search';
const read=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}};
const state={jobs:read(LS.jobs,[]),history:read(LS.history,[]),token:null,email:null,tokenClient:null};
const AREAS={LOGISTICA:'Logística',ADMINISTRATIVO:'Administrativo',RH_DP:'RH/DP'};
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const esc=s=>String(s||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(16).slice(2);
const now=()=>new Date().toISOString();
const save=()=>{localStorage.setItem(LS.jobs,JSON.stringify(state.jobs));localStorage.setItem(LS.history,JSON.stringify(state.history));};
const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),2800)};
const history=(label,detail='')=>{state.history.push({id:uid(),at:now(),label,detail});if(state.history.length>500)state.history.shift();save()};
const fmt=x=>{try{return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(x))}catch{return x}};

function inferArea(title,desc=''){
  const t=norm(title+' '+desc), s={LOGISTICA:0,ADMINISTRATIVO:0,RH_DP:0};
  ['logistica','transport','expedicao','frete','roteir','entrega','estoque','motorista','cte','mdfe','faturamento'].forEach(k=>t.includes(k)&&s.LOGISTICA++);
  ['administrativ','escritorio','document','planilha','arquivo','recepc','compras','backoffice'].forEach(k=>t.includes(k)&&s.ADMINISTRATIVO++);
  ['recursos humanos','rh','departamento pessoal','admiss','rescis','folha','ponto','beneficio','recrut','selecao'].forEach(k=>t.includes(k)&&s.RH_DP++);
  return Object.entries(s).sort((a,b)=>b[1]-a[1])[0][1]?Object.entries(s).sort((a,b)=>b[1]-a[1])[0][0]:'ADMINISTRATIVO';
}
function analyze(j){
  const text=norm((j.title||'')+' '+(j.description||'')), risks=[],reasons=[];
  let score=100; const area=j.area&&j.area!=='AUTO'?j.area:inferArea(j.title,j.description);
  if(!CFG.allowedCities.map(norm).includes(norm(j.city))){score-=45;risks.push('Cidade fora do foco atual.')}
  ['estagio','estagiario','jovem aprendiz','aprendiz','trainee','vendedor','consultor comercial','executivo comercial','supervisor','coordenador','gerente'].forEach(k=>{if(text.includes(k)){score-=55;risks.push('Possível exclusão: '+k);}});
  if(/\banalista\b/.test(text)){score-=35;risks.push('Nível analista.')}
  const superior=/(superior completo|graduacao completa|ensino superior completo|formacao superior)/.test(text);
  const especifico=/(administracao|logistica|recursos humanos|gestao de rh|contabilidade|ciencias contabeis)/.test(text);
  const pedag=/(pedagogia|qualquer area|qualquer curso|formacao superior em qualquer)/.test(text);
  const opcional=/(desejavel|diferencial|preferencial|cursando|em andamento)/.test(text);
  if(superior&&especifico&&!pedag&&!opcional){score-=45;risks.push('Pode exigir graduação específica diferente de Pedagogia.')}
  if(/ensino medio|nivel medio/.test(text))reasons.push('Escolaridade compatível.');
  if(area==='LOGISTICA')reasons.push('Alinhada à experiência logística.');
  if(area==='ADMINISTRATIVO')reasons.push('Alinhada à experiência administrativa.');
  if(area==='RH_DP'){reasons.push('Área-alvo RH/DP.');if(/folha|rescis|e-social|esocial|admiss/.test(text)){score-=12;risks.push('Pode exigir prática direta de DP.');}}
  if(/excel|google sheets|planilha/.test(text))reasons.push('Aderência por Excel/Sheets.');
  score=Math.max(0,Math.min(100,score));
  return {area,score,fit:score>=75?'COMPATIVEL':score>=55?'REVISAR':'BAIXA',risks:[...new Set(risks)],reasons:[...new Set(reasons)]};
}
const enrich=j=>({...j,...analyze(j)});
const status=s=>({NOVA:'Nova',REVISAR:'Revisar',MANUAL:'Portal/manual',ENVIADA:'Enviada',IGNORADA:'Ignorada'}[s]||s);
function card(j){
  j=enrich(j);
  return '<article class="job-card card"><div class="job-card-head"><div><div class="job-title">'+esc(j.title)+'</div><div class="job-meta">'+esc(j.company)+' • '+esc(j.city)+'</div></div><div class="score">'+j.score+'%</div></div><div class="badges"><span class="badge">'+AREAS[j.area]+'</span><span class="badge '+(j.fit==='COMPATIVEL'?'good':j.fit==='BAIXA'?'bad':'warn')+'">'+(j.fit==='COMPATIVEL'?'Compatível':j.fit==='REVISAR'?'Revisar':'Baixa aderência')+'</span><span class="badge">'+status(j.status)+'</span></div><div class="job-actions"><button class="btn btn-secondary compact" data-action="detail" data-id="'+j.id+'">Detalhes</button>'+(j.status!=='ENVIADA'&&j.status!=='IGNORADA'?'<button class="btn btn-primary compact" data-action="apply" data-id="'+j.id+'">'+(j.email?'Candidatar':'Abrir portal')+'</button>':'')+'</div></article>';
}
function render(){
  const all=state.jobs.map(enrich);
  $('#statTotal').textContent=all.length;
  $('#statFit').textContent=all.filter(j=>j.fit==='COMPATIVEL'&&!['ENVIADA','IGNORADA'].includes(j.status)).length;
  $('#statSent').textContent=all.filter(j=>j.status==='ENVIADA').length;
  $('#statManual').textContent=all.filter(j=>j.status==='MANUAL').length;
  const p=all.filter(j=>!['ENVIADA','IGNORADA'].includes(j.status)).sort((a,b)=>b.score-a.score).slice(0,6);
  $('#priorityJobs').innerHTML=p.length?p.map(card).join(''):'<div class="empty">Nenhuma vaga cadastrada.</div>';
  const fa=$('#filterArea').value,fs=$('#filterStatus').value,ft=norm($('#filterText').value);
  const f=all.filter(j=>(!fa||j.area===fa)&&(!fs||j.status===fs)&&(!ft||norm(j.title+' '+j.company+' '+j.city).includes(ft)));
  $('#jobsList').innerHTML=f.length?f.map(card).join(''):'<div class="empty">Nenhuma vaga corresponde aos filtros.</div>';
  $('#historyList').innerHTML=state.history.length?[...state.history].reverse().map(h=>'<div class="timeline-item"><strong>'+esc(h.label)+'</strong><div class="small muted">'+esc(h.detail||'')+'</div><time>'+fmt(h.at)+'</time></div>').join(''):'<div class="empty">O histórico aparecerá aqui.</div>';
  $('#resumeSettings').innerHTML=Object.entries(CFG.resumes).map(([k,v])=>'<div class="resume-line"><div><strong>'+AREAS[k]+'</strong><div class="small muted">'+esc(v.name)+'</div></div><code>'+esc(v.driveId.slice(0,10))+'…</code></div>').join('');
  $('#googleStatus').textContent=state.email?'Conectado como '+state.email+'.':'Não conectado.';
  $('#googleBtn').textContent=state.email?'Google conectado':'Conectar Google';
}
function preview(){
  const a=analyze({title:$('#jobTitle').value,city:$('#jobCity').value,area:$('#jobArea').value,description:$('#jobDescription').value});
  $('#analysisPreview').innerHTML='<div class="analysis-box"><strong>Triagem: '+a.score+'% • '+AREAS[a.area]+'</strong><div class="small muted">'+(a.fit==='COMPATIVEL'?'Compatível pelos critérios atuais.':a.fit==='REVISAR'?'Precisa de revisão manual.':'Baixa aderência.')+'</div>'+(a.risks.length?'<ul class="risk-list">'+a.risks.map(r=>'<li>'+esc(r)+'</li>').join('')+'</ul>':'')+'</div>';
}
function openForm(j){
  $('#jobForm').reset(); $('#jobId').value=j?.id||''; $('#jobTitle').value=j?.title||''; $('#jobCompany').value=j?.company||''; $('#jobCity').value=j?.city||'Serra'; $('#jobArea').value=j?.area||'AUTO'; $('#jobUrl').value=j?.url||''; $('#jobEmail').value=j?.email||''; $('#jobSource').value=j?.source||''; $('#jobDescription').value=j?.description||''; preview(); $('#jobDialog').showModal();
}
function saveJob(e){
  e.preventDefault(); const id=$('#jobId').value, old=state.jobs.find(j=>j.id===id);
  const j={id:id||uid(),title:$('#jobTitle').value.trim(),company:$('#jobCompany').value.trim(),city:$('#jobCity').value,area:$('#jobArea').value,url:$('#jobUrl').value.trim(),email:$('#jobEmail').value.trim(),source:$('#jobSource').value.trim(),description:$('#jobDescription').value.trim(),status:old?.status||'NOVA',createdAt:old?.createdAt||now(),updatedAt:now()};
  const a=analyze(j); if(j.area==='AUTO')j.area=a.area; if(!old&&a.fit==='REVISAR')j.status='REVISAR';
  if(old)state.jobs[state.jobs.findIndex(x=>x.id===id)]=j;else state.jobs.push(j);
  history(old?'Vaga atualizada':'Vaga adicionada',j.title+' — '+j.company); save(); $('#jobDialog').close(); render(); toast('Vaga salva.');
}
const getJob=id=>state.jobs.find(j=>j.id===id);
function updateJob(j){const i=state.jobs.findIndex(x=>x.id===j.id);if(i>=0)state.jobs[i]=j;save();render();}
function detail(j){
  const a=analyze(j), resume=CFG.resumes[a.area];
  $('#detailContent').innerHTML='<div class="dialog-head"><div><p class="eyebrow">'+AREAS[a.area]+'</p><h2>'+esc(j.title)+'</h2><p class="small muted">'+esc(j.company)+' • '+esc(j.city)+'</p></div><button class="icon-btn" data-action="close-detail">×</button></div><div class="detail-grid"><div class="detail-row"><small>Compatibilidade</small><strong>'+a.score+'%</strong></div><div class="detail-row"><small>Currículo</small><strong>'+esc(resume.name)+'</strong></div><div class="detail-row"><small>Contato</small><strong>'+(j.email?esc(j.email):'Somente portal/manual')+'</strong></div></div>'+(a.risks.length?'<div class="analysis-box"><strong>Atenção</strong><ul class="risk-list">'+a.risks.map(r=>'<li>'+esc(r)+'</li>').join('')+'</ul></div>':'')+'<div class="row">'+(j.url?'<button class="btn btn-secondary" data-action="open-url" data-id="'+j.id+'">Abrir vaga</button>':'')+(j.status!=='ENVIADA'?'<button class="btn btn-primary" data-action="apply" data-id="'+j.id+'">'+(j.email?'Candidatar':'Marcar como manual')+'</button>':'')+'<button class="btn btn-secondary" data-action="edit" data-id="'+j.id+'">Editar</button><button class="btn btn-danger ghost" data-action="ignore" data-id="'+j.id+'">Ignorar</button></div>';
  $('#detailDialog').showModal();
}
async function gfetch(url,opt={}){
  const r=await fetch(url,{...opt,headers:{...(opt.headers||{}),Authorization:'Bearer '+state.token}});
  if(!r.ok)throw new Error(r.status+': '+await r.text()); return r.status===204?null:r.json();
}
async function googleConnect(){
  if(state.token)return true;
  const clientId=(localStorage.getItem(LS.client)||CFG.googleClientId||'').trim();
  if(!clientId||clientId.startsWith('COLE_')){toast('Configure o OAuth Client ID em Ajustes.');nav('settings');return false;}
  if(!window.google?.accounts?.oauth2){toast('Biblioteca do Google ainda não carregou.');return false;}
  return new Promise(resolve=>{
    state.tokenClient=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:CFG.googleScopes,callback:async r=>{
      if(r.error){toast('Falha ao conectar ao Google.');return resolve(false)}
      state.token=r.access_token;
      try{state.email=(await gfetch('https://gmail.googleapis.com/gmail/v1/users/me/profile')).emailAddress}catch{}
      render();resolve(true);
    }});
    state.tokenClient.requestAccessToken({prompt:'consent'});
  });
}
async function duplicate(j){
  const q=['in:sent']; if(j.email)q.push('to:'+j.email); if(j.company)q.push('"'+j.company.replace(/"/g,'')+'"');
  const d=await gfetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?q='+encodeURIComponent(q.join(' '))+'&maxResults=10');
  return (d.resultSizeEstimate||0)>0;
}
const b64utf8=s=>btoa(unescape(encodeURIComponent(s)));
const b64url=s=>s.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function bytes64(bytes){let out='',c=0x8000;for(let i=0;i<bytes.length;i+=c)out+=String.fromCharCode(...bytes.subarray(i,Math.min(i+c,bytes.length)));return btoa(out);}
function body(j){
  const a=analyze(j).area;
  const p={LOGISTICA:'Tenho experiência em rotinas logísticas e administrativas, com atuação em conferência, acompanhamento de operações e entregas, contato com motoristas e fornecedores, controles, documentos e planilhas.',ADMINISTRATIVO:'Tenho experiência em rotinas administrativas, organização documental, controles internos, atendimento, acompanhamento de prazos e uso de Excel e Google Sheets.',RH_DP:'Estou cursando Pedagogia e busco direcionar minha experiência administrativa, organização de informações, atendimento e controles para uma oportunidade em Recursos Humanos/Departamento Pessoal.'}[a];
  return 'Olá,\n\nMeu nome é '+CFG.candidate.name+' e gostaria de me candidatar à vaga de '+j.title+', em '+j.city+'/ES.\n\n'+p+'\n\nEncaminho meu currículo para avaliação e fico à disposição para entrevista.\n\nAtenciosamente,\n'+CFG.candidate.name+'\n'+CFG.candidate.phone+'\n'+CFG.candidate.email;
}
async function rawEmail(j,resume){
  const r=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(resume.driveId)+'?alt=media',{headers:{Authorization:'Bearer '+state.token}});
  if(!r.ok)throw new Error('Não foi possível baixar o currículo do Drive.');
  const att=bytes64(new Uint8Array(await r.arrayBuffer())), b='jobpilot_'+Date.now(), subject='Candidatura – '+j.title+' – '+j.city+'/ES';
  const lines=['From: '+CFG.candidate.email,'To: '+j.email,'Subject: =?UTF-8?B?'+b64utf8(subject)+'?=','MIME-Version: 1.0','Content-Type: multipart/mixed; boundary="'+b+'"','','--'+b,'Content-Type: text/plain; charset="UTF-8"','Content-Transfer-Encoding: base64','',b64utf8(body(j)),'','--'+b,'Content-Type: application/pdf; name="'+resume.name+'"','Content-Disposition: attachment; filename="'+resume.name+'"','Content-Transfer-Encoding: base64','',att,'','--'+b+'--',''];
  return b64url(btoa(lines.join('\r\n')));
}
async function apply(j){
  if(!j.email){j.status='MANUAL';updateJob(j);history('Ação manual necessária',j.title+' — '+j.company);if(j.url)window.open(j.url,'_blank','noopener');toast('Vaga marcada como manual.');return;}
  if(!(await googleConnect()))return;
  try{
    toast('Verificando duplicidade no Gmail…');
    if(await duplicate(j)){history('Envio bloqueado por duplicidade',j.title+' — '+j.company);toast('Já existe candidatura enviada para esta empresa/e-mail.');return;}
    const resume=CFG.resumes[analyze(j).area];
    if(!confirm('Enviar candidatura para '+j.company+'?\n\nCargo: '+j.title+'\nCurrículo: '+resume.name+'\nDestino: '+j.email))return;
    if(await duplicate(j)){toast('Duplicidade detectada. Envio cancelado.');return;}
    toast('Preparando candidatura…');
    const raw=await rawEmail(j,resume);
    await gfetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raw})});
    j.status='ENVIADA';j.sentAt=now();updateJob(j);history('Candidatura enviada',j.title+' — '+j.company+' • '+j.email);toast('Candidatura enviada.');if($('#detailDialog').open)$('#detailDialog').close();
  }catch(e){console.error(e);history('Erro no envio',j.title+' — '+j.company);toast('Falha no envio. Verifique a configuração do Google.');}
}
function nav(v){$$('.view').forEach(x=>x.classList.toggle('active',x.dataset.view===v));$$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.nav===v));scrollTo({top:0,behavior:'smooth'});}
function exportData(){const blob=new Blob([JSON.stringify({version:1,exportedAt:now(),jobs:state.jobs,history:state.history},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='jobpilot-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(a.href);}
async function importData(file){try{const d=JSON.parse(await file.text());if(!Array.isArray(d.jobs))throw 0;state.jobs=d.jobs;state.history=Array.isArray(d.history)?d.history:[];save();render();toast('Backup importado.')}catch{toast('Backup inválido.')}}

async function searchJobs(){
  const btn=$('#searchJobsBtn');
  const original=btn.textContent;
  btn.disabled=true;
  btn.textContent='Pesquisando…';
  toast('Pesquisando vagas públicas…');
  try{
    const r=await fetch(SEARCH_API,{cache:'no-store'});
    if(!r.ok)throw new Error('Busca indisponível');
    const data=await r.json();
    const incoming=Array.isArray(data.jobs)?data.jobs:[];
    let added=0;
    const existingUrls=new Set(state.jobs.map(j=>(j.url||'').replace(/[?#].*$/,'')).filter(Boolean));
    const existingKeys=new Set(state.jobs.map(j=>norm([j.title,j.company,j.city].join('|'))));
    for(const x of incoming){
      const cleanUrl=(x.url||'').replace(/[?#].*$/,'');
      const key=norm([x.title,x.company,x.city].join('|'));
      if((cleanUrl&&existingUrls.has(cleanUrl))||existingKeys.has(key))continue;
      const j={
        id:uid(),
        title:x.title||'Vaga encontrada',
        company:x.company||'Empresa não identificada',
        city:x.city||'Serra',
        area:x.area||'AUTO',
        url:x.url||'',
        email:'',
        source:x.source||'Pesquisa pública',
        description:x.description||'',
        status:'NOVA',
        createdAt:now(),
        updatedAt:now(),
        discoveredAt:x.publishedAt||now()
      };
      const a=analyze(j);
      if(j.area==='AUTO')j.area=a.area;
      if(a.fit==='REVISAR')j.status='REVISAR';
      state.jobs.push(j);
      if(cleanUrl)existingUrls.add(cleanUrl);
      existingKeys.add(key);
      added++;
    }
    history('Pesquisa de vagas',added+' novas vagas importadas');
    save();
    render();
    nav('jobs');
    toast(added?added+' novas vagas adicionadas.':'Nenhuma vaga nova encontrada.');
  }catch(e){
    console.error(e);
    history('Falha na pesquisa de vagas',String(e?.message||e));
    toast('Não foi possível pesquisar agora.');
  }finally{
    btn.disabled=false;
    btn.textContent=original;
  }
}

document.addEventListener('click',e=>{
  const b=e.target.closest('[data-action],[data-nav]'); if(!b)return;
  if(b.dataset.nav)return nav(b.dataset.nav);
  const a=b.dataset.action,j=b.dataset.id?getJob(b.dataset.id):null;
  if(a==='open-add')openForm(); if(a==='close-add')$('#jobDialog').close(); if(a==='detail'&&j)detail(j); if(a==='close-detail')$('#detailDialog').close();
  if(a==='edit'&&j){$('#detailDialog').close();openForm(j)} if(a==='ignore'&&j){j.status='IGNORADA';updateJob(j);history('Vaga ignorada',j.title+' — '+j.company);$('#detailDialog').close();toast('Vaga ignorada.')}
  if(a==='open-url'&&j?.url)window.open(j.url,'_blank','noopener'); if(a==='apply'&&j)apply(j);
});
$('#jobForm').addEventListener('submit',saveJob);
['jobTitle','jobCity','jobArea','jobDescription'].forEach(id=>$('#'+id).addEventListener('input',preview));
['filterArea','filterStatus','filterText'].forEach(id=>$('#'+id).addEventListener('input',render));
$('#googleBtn').addEventListener('click',googleConnect);
$('#searchJobsBtn').addEventListener('click',searchJobs);
$('#clientIdInput').value=localStorage.getItem(LS.client)||(!CFG.googleClientId.startsWith('COLE_')?CFG.googleClientId:'');
$('#saveClientId').addEventListener('click',()=>{localStorage.setItem(LS.client,$('#clientIdInput').value.trim());state.token=null;state.email=null;render();toast('Client ID salvo.');});
$('#exportBtn').addEventListener('click',exportData);
$('#importInput').addEventListener('change',e=>e.target.files[0]&&importData(e.target.files[0]));
$('#clearBtn').addEventListener('click',()=>{if(confirm('Apagar todas as vagas e o histórico deste aparelho?')){state.jobs=[];state.history=[];save();render();toast('Dados apagados.');}});
if('serviceWorker'in navigator)addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
render();
})();