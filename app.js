(function(){
  const root=document.documentElement;
  const tok=n=>getComputedStyle(root).getPropertyValue(n).trim();
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const redrawers=[];
  const redrawAll=()=>redrawers.forEach(f=>f());
  addEventListener('resize',redrawAll);
  // matchMedia('(prefers-color-scheme: dark)').addEventListener('change',redrawAll);
  // new MutationObserver(redrawAll).observe(root,{attributes:true,attributeFilter:['data-theme']});

  function seg(id,onChange){
    const el=document.getElementById(id);
    el.addEventListener('click',e=>{
      const b=e.target.closest('button'); if(!b) return;
      el.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b?'true':'false'));
      onChange(b.dataset.v);
    });
  }

  /* ---------- Forecast explorer ---------- */
  if(document.getElementById('fc')){
  const ASSETS={
    brent:{name:'BRENT CRUDE',seed:7,vol:1.6,drift:0.10,dec:1},
    gold:{name:'GOLD',seed:21,vol:0.9,drift:0.06,dec:1},
    eurusd:{name:'EUR/USD',seed:3,vol:0.35,drift:-0.012,dec:2},
    equity:{name:'GLOBAL EQUITIES',seed:44,vol:1.1,drift:-0.05,dec:1}
  };
  const st={asset:'brent',h:30,ci:80};
  const c=document.getElementById('fc'), ctx=c.getContext('2d'), tip=document.getElementById('tip');
  const HIST=60; let data=null, hover=null, anim=1, geo=null;

  // DATA SOURCE: replace build() series with a live market-data feed when one is connected.
  function build(){
    const a=ASSETS[st.asset]; let s=a.seed;
    const rnd=()=>{s=(s*9301+49297)%233280;return s/233280};
    const obs=[]; let v=100;
    for(let i=0;i<HIST;i++){v+=(rnd()-.48)*a.vol; obs.push(v)}
    const z=st.ci===95?1.96:1.28;
    const fc=[],lo=[],hi=[]; let f=obs[HIST-1];
    for(let i=1;i<=90;i++){
      f+=a.drift+(rnd()-.5)*a.vol*.25;
      const sd=a.vol*0.55*Math.sqrt(i);
      if(i<=st.h){fc.push(f);lo.push(f-z*sd);hi.push(f+z*sd)}
    }
    data={obs,fc,lo,hi,a};
    const last=obs[HIST-1], end=fc[fc.length-1], mv=(end/last-1)*100;
    document.getElementById('sym').textContent=`${a.name} · ${st.h}D FORECAST`;
    const sig=document.getElementById('sig');
    sig.textContent=mv>1.5?'Accumulate':mv<-1.5?'Reduce':'Hold';
    sig.className=mv>1.5?'up':mv<-1.5?'down':'';
    document.getElementById('mv').textContent=(mv>=0?'+':'')+mv.toFixed(1)+'%';
    document.getElementById('bw').textContent='±'+((hi.at(-1)-lo.at(-1))/2).toFixed(1);
  }

  function draw(){
    if(!data) return;
    const dpr=devicePixelRatio||1, W=c.clientWidth, H=c.clientHeight;
    c.width=W*dpr; c.height=H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,W,H);
    const {obs,fc,lo,hi}=data, N=obs.length, F=fc.length;
    const all=obs.concat(lo,hi), mn=Math.min(...all)-.5, mx=Math.max(...all)+.5;
    const padL=4,padR=40,padT=8,padB=18;
    const x=i=>padL+(W-padL-padR)*i/(N+F-1), y=v=>padT+(H-padT-padB)*(1-(v-mn)/(mx-mn));
    geo={x,y,N,F,padL,padR,W};
    const line=tok('--line'),fg=tok('--fg'),ac=tok('--accent'),mu=tok('--muted');
    ctx.lineWidth=1; ctx.font='10px "IBM Plex Mono", monospace';
    const span=mx-mn, raw=span/4, mag=Math.pow(10,Math.floor(Math.log10(raw))), step=[1,2,5,10].map(m=>m*mag).find(m=>m>=raw);
    for(let g=Math.ceil(mn/step)*step; g<=mx; g+=step){
      ctx.strokeStyle=line; ctx.beginPath(); ctx.moveTo(padL,y(g)); ctx.lineTo(W-padR,y(g)); ctx.stroke();
      ctx.fillStyle=mu; ctx.fillText(g.toFixed(step<1?1:0),W-padR+6,y(g)+3);
    }
    ctx.strokeStyle=line; ctx.setLineDash([3,4]); ctx.beginPath(); ctx.moveTo(x(N-1),padT); ctx.lineTo(x(N-1),H-padB); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle=mu; ctx.fillText('TODAY',x(N-1)-16,H-4);
    ctx.strokeStyle=fg; ctx.lineWidth=1.6; ctx.beginPath(); obs.forEach((o,i)=>i?ctx.lineTo(x(i),y(o)):ctx.moveTo(x(i),y(o))); ctx.stroke();
    const k=Math.max(1,Math.round(F*anim));
    ctx.globalAlpha=.22; ctx.fillStyle=ac; ctx.beginPath(); ctx.moveTo(x(N-1),y(obs[N-1]));
    for(let i=0;i<k;i++) ctx.lineTo(x(N+i),y(hi[i]));
    for(let i=k-1;i>=0;i--) ctx.lineTo(x(N+i),y(lo[i]));
    ctx.closePath(); ctx.fill(); ctx.globalAlpha=1;
    ctx.strokeStyle=ac; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x(N-1),y(obs[N-1]));
    for(let i=0;i<k;i++) ctx.lineTo(x(N+i),y(fc[i])); ctx.stroke();
    ctx.fillStyle=ac; ctx.beginPath(); ctx.arc(x(N+k-1),y(fc[k-1]),3.5,0,7); ctx.fill();
    if(hover!=null && anim>=1){
      const i=hover, isF=i>=N, val=isF?fc[i-N]:obs[i];
      ctx.strokeStyle=mu; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(x(i),padT); ctx.lineTo(x(i),H-padB); ctx.stroke();
      ctx.fillStyle=isF?ac:fg; ctx.beginPath(); ctx.arc(x(i),y(val),4.5,0,7); ctx.fill();
      ctx.strokeStyle=tok('--bg-2'); ctx.lineWidth=2; ctx.stroke();
    }
  }
  redrawers.push(draw);

  function showTip(i){
    const {obs,fc,lo,hi,a}=data, N=obs.length, d=a.dec;
    const day=i-(N-1), lbl=day===0?'Today':(day>0?`T+${day}d`:`T${day}d`);
    if(i<N){ tip.innerHTML=`<b>${lbl}</b><br>Observed <b>${obs[i].toFixed(d)}</b>`; }
    else { const j=i-N; tip.innerHTML=`<b>${lbl}</b><br>Forecast <b>${fc[j].toFixed(d)}</b><br>${st.ci}% band ${lo[j].toFixed(d)} – ${hi[j].toFixed(d)}`; }
    tip.hidden=false;
    const px=geo.x(i), w=tip.offsetWidth, W=c.clientWidth;
    tip.style.left=Math.min(Math.max(0,px+12>W-w?px-w-12:px+12),W-w)+'px';
  }
  function onMove(e){
    if(!geo) return;
    const r=c.getBoundingClientRect(), px=e.clientX-r.left;
    const t=(px-geo.padL)/(geo.W-geo.padL-geo.padR);
    hover=Math.max(0,Math.min(geo.N+geo.F-1,Math.round(t*(geo.N+geo.F-1))));
    draw(); showTip(hover);
  }
  c.addEventListener('pointermove',onMove);
  c.addEventListener('pointerdown',onMove);
  c.addEventListener('pointerleave',()=>{hover=null;tip.hidden=true;draw()});

  function play(){
    hover=null; tip.hidden=true;
    if(reduce){anim=1;draw();return}
    let t0=null;
    const f=t=>{if(!t0)t0=t; const p=Math.min(1,(t-t0)/900); anim=.05+.95*(1-Math.pow(1-p,3)); draw(); if(p<1) requestAnimationFrame(f)};
    requestAnimationFrame(f);
  }
  function refresh(){build();play()}
  seg('assetSeg',v=>{st.asset=v;refresh()});
  seg('hzSeg',v=>{st.h=+v;refresh()});
  seg('ciSeg',v=>{st.ci=+v;build();draw()});
  build(); anim=1; draw(); play();
  }
  /* ---------- Method stepper ---------- */
  if(document.getElementById('steps')){
  const STEPS=[
    {w:'Market feeds, filings, trade flows and your own operating data are cleaned and joined into one record.',
     t:'Price history, order-book depth, positioning reports and macro releases for the instruments in scope.',
     b:'Sales, costs, supplier data and market research for the business, brand or acquisition target.'},
    {w:'Forecasting and pattern models are built and tested against history before any output is trusted.',
     t:'Price and volatility models back-tested across past regimes, with error ranges recorded.',
     b:'Demand, margin and cash-flow models stress-tested against downside scenarios.'},
    {w:'Outputs become clear calls with a horizon, a confidence level and the limits that go with them.',
     t:'Accumulate, hold or reduce signals with entry, exit and stop levels.',
     b:'Go or no-go recommendations, budgets and milestones for the board to approve.'},
    {w:'Decisions are carried out, then measured against the original thesis and fed back into the models.',
     t:'Orders placed within risk limits, with performance reported against the signal.',
     b:'Plans put into operation through sourcing, supply and reporting, tracked against KPIs.'}
  ];
  const tabs=[...document.querySelectorAll('#steps [role=tab]')];
  let cur=0, timer=null;
  function setStep(n,focus){
    cur=(n+4)%4;
    tabs.forEach((t,i)=>{t.setAttribute('aria-selected',i===cur);t.tabIndex=i===cur?0:-1});
    if(focus) tabs[cur].focus();
    document.getElementById('stepbody').setAttribute('aria-labelledby','st'+cur);
    document.getElementById('sbWhat').textContent=STEPS[cur].w;
    document.getElementById('sbTrade').textContent=STEPS[cur].t;
    document.getElementById('sbBiz').textContent=STEPS[cur].b;
    document.getElementById('prog').style.width=((cur+1)*25)+'%';
  }
  tabs.forEach((t,i)=>{
    t.addEventListener('click',()=>{clearInterval(timer);setStep(i)});
    t.addEventListener('keydown',e=>{
      if(e.key==='ArrowRight'){e.preventDefault();clearInterval(timer);setStep(cur+1,true)}
      if(e.key==='ArrowLeft'){e.preventDefault();clearInterval(timer);setStep(cur-1,true)}
    });
  });
  setStep(0);
  if(!reduce) timer=setInterval(()=>setStep(cur+1),5000);
  }
  /* ---------- Growth planner ---------- */
  if(document.getElementById('plan')){
  const $=id=>document.getElementById(id);
  const svg=$('plan'), NS='http://www.w3.org/2000/svg';
  const fmt=v=>'AED '+(v>=100?v.toFixed(0):v.toFixed(1))+'m';
  let sel=null, rows=[];
  function calc(){
    const r0=+$('pRev').value, g=+$('pGr').value/100, m0=+$('pMg').value/100, dm=+$('pMx').value/100;
    $('oRev').textContent=fmt(r0); $('oGr').textContent=(g*100).toFixed(0)+'%';
    $('oMg').textContent=(m0*100).toFixed(0)+'%'; $('oMx').textContent='+'+(dm*100).toFixed(1)+' pts';
    rows=[]; for(let y=0;y<5;y++){const rev=r0*Math.pow(1+g,y), m=Math.min(.6,m0+dm*y); rows.push({y:y+1,rev,m,eb:rev*m})}
    $('kRev').textContent=fmt(rows[4].rev); $('kEb').textContent=fmt(rows[4].eb);
    $('kCum').textContent=fmt(rows.reduce((a,r)=>a+r.eb,0));
    render();
  }
  function el(t,a,p){const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);(p||svg).appendChild(e);return e}
  function render(){
    svg.innerHTML='';
    const W=560,H=260,l=52,r=8,t=10,b=28, max=Math.max(...rows.map(x=>x.rev));
    const raw=max/4, mag=Math.pow(10,Math.floor(Math.log10(raw))), step=[1,2,2.5,5,10].map(m=>m*mag).find(m=>m>=raw);
    const top=Math.ceil(max/step)*step, y=v=>t+(H-t-b)*(1-v/top);
    for(let v=0;v<=top+1e-9;v+=step){el('line',{x1:l,x2:W-r,y1:y(v),y2:y(v)});const tx=el('text',{x:l-8,y:y(v)+4,'text-anchor':'end'});tx.textContent=v.toFixed(step<1?1:0)}
    const cw=(W-l-r)/5, bw=cw*.56;
    rows.forEach((row,i)=>{
      const g=el('g',{class:'col'+(sel===i?' on':''),tabindex:0,role:'button','aria-label':`Year ${row.y}: revenue ${fmt(row.rev)}, EBITDA ${fmt(row.eb)}`});
      const x0=l+cw*i+(cw-bw)/2;
      el('rect',{x:l+cw*i,y:t,width:cw,height:H-t-b,fill:'transparent'},g);
      el('rect',{class:'bar',x:x0,y:y(row.rev),width:bw,height:y(0)-y(row.rev),rx:3},g);
      el('rect',{class:'bar e',x:x0,y:y(row.eb),width:bw,height:Math.max(0,y(0)-y(row.eb)),rx:3},g);
      const tx=el('text',{x:x0+bw/2,y:H-8,'text-anchor':'middle'},g); tx.textContent='Y'+row.y;
      const pick=()=>{sel=i;tip2(i);svg.querySelectorAll('g.col').forEach((n,k)=>n.classList.toggle('on',k===i))};
      g.addEventListener('mouseenter',pick); g.addEventListener('click',pick); g.addEventListener('focus',pick);
    });
    if(sel!=null) tip2(sel);
  }
  function tip2(i){const r=rows[i];$('planTip').innerHTML=`<b>Year ${r.y}</b> · Revenue <b>${fmt(r.rev)}</b> · EBITDA <b>${fmt(r.eb)}</b> · Margin <b>${(r.m*100).toFixed(1)}%</b>`}
  ['pRev','pGr','pMg','pMx'].forEach(id=>$(id).addEventListener('input',calc));
  calc();

  }


  /* ---------- Live market data (TradingView widgets) ---------- */
  const TV='https://s3.tradingview.com/external-embedding/';
  // const dark=()=>{const t=root.getAttribute('data-theme');return t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches};
  function mountTV(host,widget,config,fallbackMsg){
    if(!host) return;
    host.innerHTML='';
    const box=document.createElement('div'); box.className='tradingview-widget-container'; box.style.height='100%';
    const inner=document.createElement('div'); inner.className='tradingview-widget-container__widget'; inner.style.height='100%';
    box.appendChild(inner);
    const sc=document.createElement('script'); sc.src=TV+widget; sc.async=true;
    // sc.textContent=JSON.stringify(Object.assign({colorTheme:dark()?'dark':'light',isTransparent:true,locale:'en'},config));

    sc.textContent=JSON.stringify(Object.assign({
      colorTheme:'light',
      isTransparent:true,
      locale:'en'
    },config));


    sc.onerror=()=>{host.innerHTML='<div class="tv-fallback">'+fallbackMsg+'</div>'};
    box.appendChild(sc); host.appendChild(box);
  }
  const tape=document.getElementById('tvTape');
  const tapeCfg={symbols:[
    {proName:'TVC:UKOIL',title:'Brent'},{proName:'TVC:USOIL',title:'WTI'},{proName:'OANDA:XAUUSD',title:'Gold'},
    {proName:'FX:EURUSD',title:'EUR/USD'},{proName:'FX_IDC:USDAED',title:'USD/AED'},{proName:'FX_IDC:USDINR',title:'USD/INR'},
    {proName:'FOREXCOM:SPXUSD',title:'S&P 500'},{proName:'BITSTAMP:BTCUSD',title:'Bitcoin'}],
    showSymbolLogo:false,displayMode:'adaptive'};
  const mountTape=()=>mountTV(tape,'embed-widget-ticker-tape.js',tapeCfg,'Live prices appear here when the site is hosted on evam.si.');
  mountTape();

  const chart=document.getElementById('tvChart');
  let sym='TVC:UKOIL';
  const mountChart=()=>mountTV(chart,'embed-widget-advanced-chart.js',
    {symbol:sym,interval:'60',timezone:'Asia/Dubai',style:'1',autosize:true,allow_symbol_change:true,hide_side_toolbar:false,withdateranges:true,
     studies:['STD;RSI'],support_host:'https://www.tradingview.com'},
    '<span><b>Live chart</b>The live TradingView chart loads when this site is hosted on evam.si. The Claude preview blocks outside chart providers.</span>');
  if(chart){
    mountChart();
    const sg=document.getElementById('tvSeg');
    sg.addEventListener('click',e=>{
      const b=e.target.closest('button'); if(!b) return;
      sg.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b?'true':'false'));
      sym=b.dataset.v; mountChart();
    });
  }
  // let lastDark=dark();
  // const retheme=()=>{const d=dark(); if(d===lastDark) return; lastDark=d; mountTape(); if(chart) mountChart()};
  // matchMedia('(prefers-color-scheme: dark)').addEventListener('change',retheme);
  // new MutationObserver(retheme).observe(root,{attributes:true,attributeFilter:['data-theme']});
})();
