// ─── GLOBAL ERROR SHIELD — prevents any single error from breaking buttons ───
window.onerror=function(msg,src,line,col,err){console.warn('App error:',msg,line);return true;};
window.onunhandledrejection=function(e){try{e.preventDefault();}catch(x){}console.warn('Unhandled promise:',e.reason);};
// ─── AI CHATBOT ───────────────────────────────────────────
let aiHistory=[];

function buildLiveDataContext(){
  // Gather all live app data and format it for the AI
  const C=loadCompanies();
  const company=currentCompanyCode?C[currentCompanyCode]:null;
  const active=borrowers.filter(b=>b.status==='active');
  const closed=borrowers.filter(b=>b.status==='closed');
  const totalLoan=active.reduce((s,b)=>s+b.amount,0);
  const totalPaid=active.reduce((s,b)=>s+b.paid,0);
  const totalPending=totalLoan-totalPaid;
  const overdue=active.filter(b=>{const bal=b.amount-b.paid;return bal>0&&b.paid<b.amount*0.1;});

  const borrowerDetails=borrowers.map(b=>{
    const bal=Math.max(0,b.amount-b.paid);
    const pct=b.amount>0?Math.round((b.paid/b.amount)*100):0;
    return `  • [#${b.chitId||b.id}] ${b.name} | Phone: ${b.phone} | Loan: ₹${b.amount} | Paid: ₹${b.paid} | Balance: ₹${bal} (${pct}%) | EMI: ₹${getEMI(b)} | Freq: ${b.freq} | Tenure: ${b.tenure} instalments | Status: ${b.status} | Agent: ${b.agent||'—'} | Started: ${b.startDate||'—'}${b.pan?' | PAN: '+b.pan:''}${b.referral&&b.referral.name?' | Referred by: '+b.referral.name:''}`;
  }).join('\n');

  const recentFeed=feedItems.slice(0,10).map(f=>`  • ${f.name} paid ₹${f.amount} via ${f.mode} at ${f.time} (collected by ${f.agent})`).join('\n')||'  None today';

  const collectorInfo=collectors.length?collectors.map(c=>`  • ${c.name}: ${c.collections} collections, ₹${c.amount}`).join('\n'):'  None';

  return `
=== LIVE APP DATA (as of right now) ===

COMPANY: ${company?company.name+' ('+company.city+')':'—'}
OWNER: ${company?company.owner:'—'}
LOGGED IN AS: ${currentRole}
PLAN: ${company?company.plan:'—'}

PORTFOLIO SUMMARY:
  Total Active Borrowers: ${active.length}
  Total Closed Accounts: ${closed.length}
  Total Loan Portfolio: ₹${fmt(totalLoan)}
  Total Collected (principal): ₹${fmt(totalPaid)}
  Total Pending Balance: ₹${fmt(totalPending)}
  Collection Rate: ${totalLoan>0?Math.round((totalPaid/totalLoan)*100):0}%

TODAY'S STATS:
  Collected Today: ₹${fmt(collectedToday)}
  Transactions Today: ${todayTxns}
  Morning (before 12pm): ₹${fmt(morAmt)}
  Afternoon (12pm–5pm): ₹${fmt(aftAmt)}
  Evening (after 5pm): ₹${fmt(eveAmt)}

WEEKLY / MONTHLY:
  This Week: ₹${fmt(weeklyTotal)}
  This Month: ₹${fmt(monthlyTotal)}

ALL BORROWERS (${borrowers.length} total):
${borrowerDetails||'  No borrowers yet.'}

TODAY'S COLLECTION FEED (recent):
${recentFeed}

TODAY'S COLLECTORS:
${collectorInfo}
`;
}

function openAIChat(){
  document.getElementById('ai-modal').classList.add('open');
  if(!aiHistory.length){
    var hasKey=false;try{hasKey=!!localStorage.getItem('dfp_ai_key');}catch(e){}
    if(hasKey){
      addAIBubble('bot',' வணக்கம்! I\'m your DailyFinance AI assistant.\n\nI have full access to your live app data — borrowers, collections, balances, reports — and can answer any question about it.\n\nWhat would you like to know?');
    } else {
      addAIBubble('bot',' வணக்கம்! I\'m your DailyFinance AI assistant.\n\nTo get started, I need your Anthropic API key. It\'s stored only on your device.\n\n<div style="margin-top:10px;display:flex;gap:8px;align-items:center"><input id="ai-key-inp" type="password" placeholder="sk-ant-..." style="flex:1;padding:8px 12px;border-radius:8px;border:1.5px solid #A8C3DE;font-size:12px;font-family:inherit;outline:none"/><button onclick="saveAIKey()" style="padding:8px 14px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">Save & Use</button></div>\n\n<div style="margin-top:8px;font-size:11px;color:#7AAABF">Get your key at console.anthropic.com</div>');
    }
  }
}
function closeAIChat(){document.getElementById('ai-modal').classList.remove('open');}
function addAIBubble(role,text,isHtml){
  const el=document.getElementById('ai-msgs');
  const d=document.createElement('div');
  d.className='ai-bubble '+(role==='bot'?'bot':'user');
  if(isHtml||text.includes('<')){d.innerHTML=text;}
  else{d.style.whiteSpace='pre-wrap';d.textContent=text;}
  el.appendChild(d);
  el.scrollTop=el.scrollHeight;
  return d;
}
function showTyping(){
  const el=document.getElementById('ai-msgs');
  const d=document.createElement('div');
  d.className='ai-bubble bot typing';d.id='ai-typing';
  d.innerHTML='<span class="ai-typing-dot"></span><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span>';
  el.appendChild(d);el.scrollTop=el.scrollHeight;
}
function hideTyping(){const t=document.getElementById('ai-typing');if(t)t.remove();}
function aiChip(q){
  document.getElementById('ai-chips').style.display='none';
  sendAIMsg(q);
}
function sendAIMsg(overrideText){
  const inp=document.getElementById('ai-inp');
  const text=((overrideText||inp.value)||'').trim();
  if(!text)return;
  inp.value='';
  addAIBubble('user',text);
  aiHistory.push({role:'user',content:text});
  showTyping();
  void (function(){
    return new Promise(function(resolve){
      var apiKey='';
      try{apiKey=localStorage.getItem('dfp_ai_key')||'';}catch(e){}
      if(!apiKey){
        hideTyping();
        // Ask user for API key
        addAIBubble('bot',' To use the AI assistant, please enter your Anthropic API key below. It will be saved locally on your device only.\n\n<div style="margin-top:10px;display:flex;gap:8px;align-items:center"><input id="ai-key-inp" type="password" placeholder="sk-ant-..." style="flex:1;padding:8px 12px;border-radius:8px;border:1.5px solid #A8C3DE;font-size:12px;font-family:inherit;outline:none"/><button onclick="saveAIKey()" style="padding:8px 14px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">Save & Use</button></div>');
        resolve();return;
      }
      var liveData='';
      try{liveData=buildLiveDataContext();}catch(e){liveData='(data unavailable)';}
      var sysPrompt='You are the built-in AI assistant for "DailyFinance Pro" — a Tamil Nadu daily finance (money lending) collection management app.\n\nYou have FULL READ ACCESS to all live app data injected below. Use it to answer questions precisely — give real numbers, real names, real balances.\n\nYou can help with:\n- Data questions: "who hasn\'t paid?", "Meena\'s balance?", "how much collected today?"\n- App guidance: adding borrowers, collecting payments, viewing reports\n- Analysis: collection rate, top borrowers, agent performance\n- Calculations: EMI, interest, remaining tenure\n\nRules:\n- Always use the live data to give exact answers\n- Be concise and friendly, use bullet points for lists\n- Respond in the same language the user writes (Tamil → Tamil)\n- Currency always in ₹\n\n'+liveData;
      fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'x-api-key':apiKey,
          'anthropic-version':'2023-06-01',
          'anthropic-dangerous-direct-browser-access':'true'
        },
        body:JSON.stringify({
          model:'claude-sonnet-4-20250514',
          max_tokens:1000,
          system:sysPrompt,
          messages:aiHistory.slice()
        })
      }).then(function(resp){return resp.json();}).then(function(data){
        hideTyping();
        if(data&&data.error){
          var errMsg=data.error.message||'API error';
          if(errMsg.toLowerCase().includes('auth')||errMsg.toLowerCase().includes('key')){
            try{localStorage.removeItem('dfp_ai_key');}catch(e){}
            addAIBubble('bot','✗ Invalid API key. Please try again.\n\n<div style="margin-top:10px;display:flex;gap:8px;align-items:center"><input id="ai-key-inp" type="password" placeholder="sk-ant-..." style="flex:1;padding:8px 12px;border-radius:8px;border:1.5px solid #A8C3DE;font-size:12px;font-family:inherit;outline:none"/><button onclick="saveAIKey()" style="padding:8px 14px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">Save & Use</button></div>');
          } else {
            addAIBubble('bot','<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Error: '+errMsg);
          }
        } else {
          var reply=(data&&data.content&&data.content[0]&&data.content[0].text)||'Sorry, could not get a response.';
          addAIBubble('bot',reply);
          aiHistory.push({role:'assistant',content:reply});
        }
        resolve();
      }).catch(function(err){
        hideTyping();
        addAIBubble('bot','<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Could not reach the AI. Please check your internet connection and try again.');
        resolve();
      });
    });
  }()).catch(function(){
    hideTyping();
    addAIBubble('bot','<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> AI is not available. Please try again.');
  });
}
function saveAIKey(){
  var inp=document.getElementById('ai-key-inp');
  if(!inp||!inp.value.trim()){return;}
  var key=inp.value.trim();
  try{localStorage.setItem('dfp_ai_key',key);}catch(e){}
  // Remove the key prompt bubble and re-send
  var msgs=document.getElementById('ai-msgs');
  if(msgs&&msgs.lastChild)msgs.removeChild(msgs.lastChild);
  var last=aiHistory[aiHistory.length-1];
  if(last&&last.role==='user'){
    showTyping();
    // retry
    var retryText=last.content;
    aiHistory.pop();
    document.getElementById('ai-inp').value=retryText;
    sendAIMsg(retryText);
  }
}

/* ── SIDEBAR TOGGLE ── */
function toggleSidebar(){
  const sb=document.getElementById('global-sidebar');
  sb.classList.toggle('collapsed');
  try{localStorage.setItem('dfp_sidebar_collapsed',sb.classList.contains('collapsed')?'1':'0');}catch(e){}
}
(function(){
  try{
    if(localStorage.getItem('dfp_sidebar_collapsed')==='1'){
      var sb=document.getElementById('global-sidebar');
      if(sb)sb.classList.add('collapsed');
    }
  }catch(e){}
})();

let currentLang='en';
function setLang(lang){
  try{
  currentLang=lang;
  [['lt-en','lt-ta'],['lt-en-top','lt-ta-top'],['lt-en-sett','lt-ta-sett']].forEach(([a,b])=>{
    const ea=document.getElementById(a),eb=document.getElementById(b);
    if(ea)ea.classList.toggle('on',lang==='en');
    if(eb)eb.classList.toggle('on',lang==='ta');
  });
  document.querySelectorAll('[data-en],[data-ta]').forEach(el=>{
    const v=el.getAttribute('data-'+lang);
    if(v){if(el.tagName==='INPUT')el.placeholder=v;else el.innerHTML=v;}
  });
  const si=document.getElementById('search-input');if(si)si.placeholder=lang==='en'?'Search by name or phone…':'பெயர் அல்லது மொபைல் மூலம் தேடுங்கள்…';
  const cs=document.getElementById('customer-search');if(cs)cs.placeholder=lang==='en'?'Search name or phone…':'பெயர் அல்லது மொபைல் தேடுங்கள்…';
  if(typeof renderBorrowers==='function')renderBorrowers();
  if(typeof renderFeed==='function')renderFeed();

  }catch(e){console.warn('setLang error:',e);}
}
const STORE_KEY='dfp_v6';
// ─── SECURITY HELPERS ────────────────────────────────────
// Simple but effective: hash using djb2 + salt so raw passwords never stored
function hashPw(pw,salt){let h=5381;const s=pw+salt;for(let i=0;i<s.length;i++){h=((h<<5)+h)^s.charCodeAt(i);h=h>>>0;}return h.toString(36);}
function getCompanySalt(code){return 'dfp_'+code.toLowerCase()+'_salt';}
function verifyPw(pw,code,storedHash){return hashPw(pw,getCompanySalt(code))===storedHash;}
// Isolated storage key per company so data never bleeds
function companyDataKey(code){return 'dfp_data_'+code;}

// Login attempt tracking (brute-force protection)
let loginAttempts=0,loginLocked=false,lockTimer=null;
const MAX_ATTEMPTS=5,LOCK_SECS=30;

function togglePwVis(inputId,btnId){
  const inp=document.getElementById(inputId),btn=document.getElementById(btnId);
  if(!inp)return;
  inp.type=inp.type==='password'?'text':'password';
  if(btn)btn.textContent=inp.type==='password'?'':'';
}

function loadCompanies(){try{const r=localStorage.getItem(STORE_KEY);return r?JSON.parse(r):{}}catch(e){return{}}}
function saveCompanies(c){try{localStorage.setItem(STORE_KEY,JSON.stringify(c))}catch(e){}}
// Load borrowers from company-isolated key
function loadCompanyData(code){try{const r=localStorage.getItem(companyDataKey(code));return r?JSON.parse(r):{borrowers:[]}}catch(e){return{borrowers:[]};}}
// Save borrowers to company-isolated key
function saveCompanyData(code,data){try{localStorage.setItem(companyDataKey(code),JSON.stringify(data))}catch(e){}}
function seedDemoCompanies(){
  const C=loadCompanies();
  const demoBorrowers={
    'VASU2024':[
      {id:1,name:'Meena Devi',phone:'98765 43210',address:'12, Anna Nagar, Coimbatore',aadhaar:'',agent:'Rajan',amount:10000,interest:2,freq:'daily',tenure:100,startDate:'2026-04-01',paid:5400,status:'active',initials:'MD',payments:[]},
      {id:2,name:'Arjun Murugan',phone:'87654 32109',address:'5, Gandhi Road, Erode',aadhaar:'',agent:'Suresh',amount:5000,interest:1.8,freq:'weekly',tenure:52,startDate:'2026-03-15',paid:2400,status:'active',initials:'AM',payments:[]},
      {id:3,name:'Lakshmi Nair',phone:'76543 21098',address:'8, Nehru Street, Salem',aadhaar:'4444 3333 2222',agent:'Kavitha',amount:3000,interest:1.5,freq:'monthly',tenure:12,startDate:'2026-01-10',paid:1500,status:'active',initials:'LN',payments:[]},
      {id:4,name:'Karthik Raj',phone:'65432 10987',address:'22, Bharathi Nagar, Tiruppur',aadhaar:'',agent:'Rajan',amount:15000,interest:2,freq:'daily',tenure:150,startDate:'2026-02-20',paid:8000,status:'active',initials:'KR',payments:[]},
      {id:5,name:'Priya Sundaram',phone:'94321 09876',address:'3, Ramnagar, Coimbatore',aadhaar:'',agent:'Suresh',amount:7000,interest:1.8,freq:'weekly',tenure:30,startDate:'2026-05-01',paid:7000,status:'closed',initials:'PS',payments:[]},
    ],
    'SRI2025':[
      {id:1,name:'Anbu Chelvan',phone:'90012 34567',address:'7, RS Puram, Salem',aadhaar:'',agent:'Mani',amount:8000,interest:2,freq:'daily',tenure:80,startDate:'2026-03-01',paid:3200,status:'active',initials:'AC',payments:[]},
      {id:2,name:'Selvi Rajan',phone:'80012 34567',address:'4, Omalur Road, Salem',aadhaar:'',agent:'Priya',amount:6000,interest:1.5,freq:'weekly',tenure:40,startDate:'2026-02-15',paid:4500,status:'active',initials:'SR',payments:[]},
    ],
    'NIDHI001':[
      {id:1,name:'Bala Krishnan',phone:'70011 22334',address:'9, Avinashi Road, Tiruppur',aadhaar:'',agent:'Kumar',amount:12000,interest:2.5,freq:'daily',tenure:120,startDate:'2026-01-20',paid:6600,status:'active',initials:'BK',payments:[]},
    ]
  };
  const demoMeta={
    'VASU2024':{code:'VASU2024',name:'Vasu Finance',owner:'Senthil Kumar',city:'Coimbatore',mobile:'98765 43210',plan:'Pro · Valid till July 2026'},
    'SRI2025':{code:'SRI2025',name:'Sri Murugan Finance',owner:'Murugesan K',city:'Salem',mobile:'94432 10987',plan:'Pro · Valid till Dec 2026'},
    'NIDHI001':{code:'NIDHI001',name:'NidhiPro Finance',owner:'Rajendran S',city:'Tiruppur',mobile:'99943 21098',plan:'Starter · Valid till Oct 2026'}
  };
  Object.keys(demoMeta).forEach(k=>{
    if(!C[k]){
      C[k]={...demoMeta[k],pwHash:hashPw('demo1234',getCompanySalt(k))};
      // Save borrowers in isolated key
      saveCompanyData(k,{borrowers:demoBorrowers[k]||[]});
    }
  });
  saveCompanies(C);
}
let borrowers=[],currentRole='owner',currentTab='active',selectedFreq='daily',selMode_='cash',currentFreqFilter='all',currentStatusFilter='all';
let curB=null,cdmB=null,collectedToday=0,todayTxns=0,weeklyTotal=0,monthlyTotal=0;
let morAmt=0,aftAmt=0,eveAmt=0,feedItems=[],notifs=[],collectors=[];
let wkData=[12400,9800,15200,8600,11000,7400,0],toastTmr,currentCompanyCode=null,nextBorrowerId=100;

window.onload=function(){
  try{seedDemoCompanies();}catch(e){console.warn('seed error',e);}
  try{
  const fd=document.getElementById('f-startdate');if(fd)fd.value=new Date().toISOString().split('T')[0];
  const hd=document.getElementById('hero-date');if(hd)hd.textContent=new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  setLang('en');
  }catch(e){console.warn('onload error',e);}

  document.addEventListener('wheel',function(e){if(document.activeElement&&document.activeElement.type==='number'){document.activeElement.blur();}},{passive:false});
  document.addEventListener('keydown',function(e){
    if(e.key==='Enter'&&e.target.tagName==='INPUT'&&e.target.type!=='submit'){
      e.preventDefault();
      const inputs=Array.from(document.querySelectorAll('input:not([disabled]):not([readonly]),select:not([disabled])'));
      const idx=inputs.indexOf(e.target);
      if(idx>-1&&idx<inputs.length-1)inputs[idx+1].focus();
    }
  });
};

function openRegister(){document.getElementById('reg-modal').classList.add('open');}
function closeRegister(){document.getElementById('reg-modal').classList.remove('open');}
function closeRegBg(e){if(e.target===document.getElementById('reg-modal'))closeRegister();}
function doRegister(){
  const co=document.getElementById('reg-company').value.trim(),ow=document.getElementById('reg-owner').value.trim(),ci=document.getElementById('reg-city').value.trim(),mo=document.getElementById('reg-mobile').value.trim(),cd=document.getElementById('reg-code').value.trim().toUpperCase();
  const pw=document.getElementById('reg-pin').value,pw2=document.getElementById('reg-pin2').value;
  if(!co||!ow||!ci||!mo||!cd){showToast('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Please fill all fields');return;}
  if(cd.length<4){showToast('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Code must be at least 4 characters');return;}
  if(pw.length<6){showToast('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Password must be at least 6 characters');return;}
  if(pw!==pw2){showToast('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Passwords do not match');return;}
  const C=loadCompanies();if(C[cd]){showToast('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Code "'+cd+'" already taken');return;}
  const pwHash=hashPw(pw,getCompanySalt(cd));
  C[cd]={code:cd,name:co,owner:ow,city:ci,mobile:mo,plan:'Starter · Valid till Dec 2026',pwHash};
  saveCompanies(C);
  // Save empty borrower data in isolated key
  saveCompanyData(cd,{borrowers:[]});
  closeRegister();
  ['reg-company','reg-owner','reg-city','reg-mobile','reg-code','reg-pin','reg-pin2'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  document.getElementById('code-input').value=cd;
  showToast('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><polyline points="20 6 9 17 4 12"/></svg> "'+co+'" registered! Enter your password to log in.');
}
function showAllCompanies(){
  const C=loadCompanies(),keys=Object.keys(C),el=document.getElementById('csel-list');
  el.innerHTML=!keys.length?'<div style="text-align:center;padding:22px;font-size:12px;color:var(--tx3)">No companies registered yet.</div>':keys.map(code=>{const c=C[code];return`<div class="csel-item" onclick="pickCompany('${code}')"><div class="csel-ava">${(c.name||'?')[0].toUpperCase()}</div><div><div class="csel-name">${c.name}</div></div><div class="csel-arr">›</div></div>`;}).join('');
  document.getElementById('csel-modal').classList.add('open');
}
function closeCsel(){document.getElementById('csel-modal').classList.remove('open');}
function closeCselBg(e){if(e.target===document.getElementById('csel-modal'))closeCsel();}
function pickCompany(code){closeCsel();document.getElementById('code-input').value=code;setTimeout(()=>{const pw=document.getElementById('pw-input');if(pw){pw.focus();pw.scrollIntoView({behavior:'smooth',block:'center'});}},200);showToast('✓ "'+code+'" selected — enter your password');}
// Show mobile elements on small screens
(function(){function checkMobile(){const m=window.innerWidth<1024;const ml=document.getElementById('lg-mobile-logo');const vt=document.getElementById('lg-ver-mobile');if(ml)ml.style.display=m?'flex':'none';if(vt)vt.style.display=m?'block':'none';}checkMobile();window.addEventListener('resize',checkMobile);})();

function selectRole(r){currentRole=r;document.querySelectorAll('.rc').forEach(c=>c.classList.remove('on'));document.querySelector('[data-role="'+r+'"]').classList.add('on');}
function doLogin(){try{
  if(loginLocked){showToast('⊘ Too many attempts. Wait '+LOCK_SECS+'s.');return;}
  const code=document.getElementById('code-input').value.trim().toUpperCase();
  const pw=document.getElementById('pw-input').value;
  const warn=document.getElementById('login-warn');
  if(!code){showToast('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Please enter company code');return;}
  if(!pw){showToast('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Please enter your password');return;}
  const C=loadCompanies(),company=C[code];
  if(!company){
    loginAttempts++;
    checkLoginLock(warn,'✗ Company code not found.');
    return;
  }
  // Password check — demo companies use default password 'demo1234'
  const expectedHash=company.pwHash||hashPw('demo1234',getCompanySalt(code));
  if(!verifyPw(pw,code,expectedHash)){
    loginAttempts++;
    checkLoginLock(warn,'✗ Wrong password. '+(MAX_ATTEMPTS-loginAttempts)+' attempts left.');
    return;
  }
  // <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><polyline points="20 6 9 17 4 12"/></svg> Successful login — reset counters
  loginAttempts=0;loginLocked=false;if(lockTimer)clearTimeout(lockTimer);
  if(warn)warn.style.display='none';
  document.getElementById('pw-input').value='';
  currentCompanyCode=code;
  // Load borrowers from isolated company storage key
  const cData=loadCompanyData(code);
  borrowers=(cData.borrowers||[]).map(b=>({...b,payments:[...(b.payments||[])]}));
  nextBorrowerId=borrowers.length?Math.max(...borrowers.map(b=>b.id))+1:1;
  weeklyTotal=wkData.reduce((s,v)=>s+v,0);monthlyTotal=weeklyTotal*4;
  collectedToday=0;todayTxns=0;morAmt=0;aftAmt=0;eveAmt=0;feedItems=[];notifs=[];
  collectors=[{name:'Rajan',collections:5,amount:6200},{name:'Suresh',collections:3,amount:3800},{name:'Kavitha',collections:2,amount:1400}];
  const rl={owner:'Owner',staff:'Office Staff',agent:'Field Agent'};
  document.getElementById('role-display').textContent=rl[currentRole]||'Owner';
  document.getElementById('role-plan-display').innerHTML=(currentRole==='owner'?'<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h20"/><path d="M4 20L6 8l6 6 6-10 2 16"/></svg>':currentRole==='staff'?'<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>':'<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>')+' '+(rl[currentRole]||'Owner')+' Account';
  const ini=(company.owner||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  const sa=document.querySelector('.sett-ava');if(sa)sa.textContent=ini;
  const sn=document.querySelector('.sett-name');if(sn)sn.textContent=company.owner||'—';
  const sc=document.querySelector('.sett-co');if(sc)sc.textContent=company.name+' · '+company.city;
  addNotif('',"Welcome back! Today's collection target: ₹15,000",'Just now','var(--gp)');
  addNotif('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>','Check overdue borrowers — action required','2 min ago','var(--redbg)');
  gotoScreen('screen-home');
  document.getElementById('ai-fab').style.display='flex';
  // Show sidebar on desktop
  const sb=document.getElementById('global-sidebar');if(sb)sb.style.display='';
  const sbco=document.getElementById('sidebar-co-name');if(sbco)sbco.textContent=company.name+' · '+company.city;
  const sbrl=document.getElementById('sidebar-co-role');if(sbrl){const rlmap={owner:'<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h20"/><path d="M4 20L6 8l6 6 6-10 2 16"/></svg> Owner',staff:'<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg> Office Staff',agent:'<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg> Field Agent'};sbrl.innerHTML=rlmap[currentRole]||'Owner';}
  setSideNav('home');
  updateStats();renderBorrowers();renderReports();renderBars();
  showToast('✓ Welcome, '+company.owner+'!');
}catch(e){showToast('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Login error. Please try again.');console.warn('login err',e);}}
function checkLoginLock(warn,msg){
  if(loginAttempts>=MAX_ATTEMPTS){
    loginLocked=true;
    if(warn){warn.style.display='block';warn.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Account locked for '+LOCK_SECS+' seconds due to too many failed attempts.';}
    lockTimer=setTimeout(()=>{loginLocked=false;loginAttempts=0;if(warn)warn.style.display='none';},LOCK_SECS*1000);
  } else {
    if(warn){warn.style.display='block';warn.textContent=msg;}
  }
  document.getElementById('pw-input').value='';
}
function saveCurrentCompany(){
  if(!currentCompanyCode)return;
  // Save borrowers to isolated key — other companies cannot access this
  saveCompanyData(currentCompanyCode,{borrowers});
}
function gotoScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const s=document.getElementById(id);
  if(s){s.classList.add('active');window.scrollTo(0,0);}
  if(id==='screen-reports'){renderReports();renderCollectors();}
  // On desktop, hide sidebar when on login screen
  const sb=document.getElementById('global-sidebar');
  if(sb){
    if(id==='screen-login'){sb.style.display='none';}
    else if(window.innerWidth>=1024 && currentCompanyCode){sb.style.display='flex';}
  }
}
function setSideNav(t){document.querySelectorAll('.sidebar-nav-item:not(.collect-btn)').forEach(e=>e.classList.remove('on'));const el=document.getElementById('snav-'+t);if(el)el.classList.add('on');}
function setBottomNav(t){document.querySelectorAll('.bn').forEach(e=>e.classList.remove('on'));const el=document.getElementById('bn-'+t);if(el)el.classList.add('on');setSideNav(t);}

function addNotif(ico,txt,time,bg){notifs.unshift({ico,txt,time,bg});renderNotifs();document.getElementById('notif-dot').style.display='block';}
function renderNotifs(){const l=document.getElementById('notif-list');if(!l)return;if(!notifs.length){l.innerHTML='<div class="np-empty">'+(currentLang==='en'?'No new notifications':'புதிய அறிவிப்புகள் இல்லை')+'</div>';return;}l.innerHTML=notifs.map(n=>`<div class="np-item"><div class="np-ico" style="background:${n.bg}">${n.ico}</div><div><div class="np-txt">${n.txt}</div><div class="np-time">${n.time}</div></div></div>`).join('');}
function toggleNotif(){document.getElementById('notif-panel').classList.toggle('open');document.getElementById('notif-overlay').classList.toggle('active');}
function closeNotif(){document.getElementById('notif-panel').classList.remove('open');document.getElementById('notif-overlay').classList.remove('active');}
function clearNotifs(){notifs=[];renderNotifs();document.getElementById('notif-dot').style.display='none';closeNotif();}

function updateStats(){
  const act=borrowers.filter(b=>b.status==='active');
  const tl=act.reduce((s,b)=>s+b.amount,0),tp=act.reduce((s,b)=>s+b.paid,0),due=act.filter(b=>(b.amount-b.paid)>0).length;
  const S=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  S('stat-loans','₹'+fmt(tl));S('stat-loans-sub',act.length+' '+(currentLang==='en'?'borrowers':'கடன்தாரர்கள்'));
  S('stat-collected','₹'+fmt(tp));S('stat-pending','₹'+fmt(tl-tp));
  S('stat-due',due+' '+(currentLang==='en'?'due today':'இன்று நிலுவை'));
  S('stat-today','₹'+fmt(collectedToday));S('stat-txn-count',todayTxns+' '+(currentLang==='en'?'transactions':'பரிவர்த்தனைகள்'));
  S('hero-collected','₹'+fmt(collectedToday));S('hero-txns',todayTxns);S('hero-pending',due);
  S('ms-today','₹'+fmt(collectedToday));S('ms-week','₹'+fmt(weeklyTotal+collectedToday));S('ms-month','₹'+fmt(monthlyTotal+collectedToday));
  const tgt=15000,pct=Math.min(100,Math.round((collectedToday/tgt)*100));
  S('cp-pct',pct+'%');const f=document.getElementById('cp-fill');if(f)f.style.width=pct+'%';
  S('cp-sub','₹'+fmt(collectedToday)+' of ₹'+fmt(tgt)+' target');
}
function setTab(t){currentTab=t;document.getElementById('tab-active').classList.toggle('on',t==='active');document.getElementById('tab-closed').classList.toggle('on',t==='closed');renderBorrowers();}
function filterBorrowers(){renderBorrowers();}
function setFreqFilter(f){currentFreqFilter=f;document.querySelectorAll('.ff-chip').forEach(c=>c.classList.toggle('on',c.dataset.ff===f));renderBorrowers();}
function setStatusFilter(s){currentStatusFilter=s;document.querySelectorAll('.sf-btn').forEach(b=>b.classList.toggle('on',b.dataset.sf===s));renderBorrowers();}
function getBorrowerDisplayStatus(b){
  const bal=b.amount-b.paid;
  if(bal<=0)return'completed';
  // Simple overdue heuristic: paid less than expected by now based on start date
  if(b.startDate){
    const start=new Date(b.startDate),now=new Date();
    const daysDiff=Math.floor((now-start)/(1000*60*60*24));
    let expectedInstals=0;
    if(b.freq==='daily')expectedInstals=daysDiff;
    else if(b.freq==='weekly')expectedInstals=Math.floor(daysDiff/7);
    else if(b.freq==='monthly')expectedInstals=Math.floor(daysDiff/30);
    const emi=b.amount/b.tenure;
    const expectedPaid=Math.min(expectedInstals*emi,b.amount);
    if(b.paid<expectedPaid*0.85)return'overdue';
  }
  return'pending';
}
function renderBorrowers(){
  const q=(document.getElementById('search-input')?.value||'').toLowerCase();
  let list=borrowers.filter(b=>b.status===currentTab);
  if(q)list=list.filter(b=>b.name.toLowerCase().includes(q)||b.phone.includes(q));
  if(currentFreqFilter!=='all')list=list.filter(b=>b.freq===currentFreqFilter);
  if(currentStatusFilter!=='all')list=list.filter(b=>getBorrowerDisplayStatus(b)===currentStatusFilter);
  const cnt=document.getElementById('list-count');
  if(cnt)cnt.textContent=list.length+' '+(currentLang==='en'?(currentTab==='active'?'Active Borrowers':'Closed Accounts'):(currentTab==='active'?'செயலில் உள்ள கடன்தாரர்கள்':'மூடிய கணக்குகள்'));
  const el=document.getElementById('borrower-list');if(!el)return;
  if(!list.length){el.innerHTML='<div class="empty-st"><div class="empty-ico"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></div><div class="empty-h">'+(currentLang==='en'?'No borrowers found':'கடன்தாரர்கள் இல்லை')+'</div><div class="empty-p">'+(q?(currentLang==='en'?'Try a different search':'வேறு தேடல் முயற்சிக்கவும்'):(currentLang==='en'?'Tap + Add New to create a borrower':'+ பொத்தான் அழுத்தி புதிய கடன்தாரர் சேர்க்கவும்'))+'</div></div>';return;}
  el.innerHTML=list.map(b=>{
    const bal=b.amount-b.paid,pct=Math.round((b.paid/b.amount)*100);
    const avCls=b.amount>=10000?'av-hi':b.amount>=5000?'av-md':'av-lo';
    const dbdg=bal<=0?`<div class="dbdg d-paid">${currentLang==='en'?'Paid ✓':'செலுத்தியது ✓'}</div>`:b.freq==='daily'?`<div class="dbdg d-today">${currentLang==='en'?'Due Today':'இன்று'}</div>`:`<div class="dbdg d-ok">${currentLang==='en'?'Upcoming':'வரவிருக்கும்'}</div>`;
    const freqIco=b.freq==='daily'?'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>':b.freq==='weekly'?'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/></svg>':'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><rect x="8" y="14" width="3" height="3"/></svg>';
    const freqLabel=currentLang==='en'?cap(b.freq):(b.freq==='daily'?'தினசரி':b.freq==='weekly'?'வாராந்திர':'மாதாந்திர');
    const bStatus=getBorrowerDisplayStatus(b);
    const statusBadge=bStatus==='overdue'?`<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:20px;font-size:9px;font-weight:700;background:var(--redbg);color:var(--red);margin-left:6px"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> ${currentLang==='en'?'Overdue':'தாமதம்'}</span>`:bStatus==='completed'?`<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:20px;font-size:9px;font-weight:700;background:var(--embg);color:var(--em);margin-left:6px">✓ ${currentLang==='en'?'Completed':'முடிந்தது'}</span>`:'';
    return`<div class="bcard" onclick="openDetail(${b.id})"><div class="bc-top"><div class="bc-ava ${avCls}">${b.initials}</div><div class="bc-info"><div class="bc-name">${b.name}<span style="margin-left:7px;font-size:9px;font-weight:700;color:var(--g1);background:var(--gp);padding:2px 7px;border-radius:20px;vertical-align:middle">${b.chitId||b.id}</span>${statusBadge}</div><div class="bc-meta"><span><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.47 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.08 6.08l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg> ${b.phone}</span><span class="mdot"></span><span>${freqIco} ${freqLabel}</span>${b.ledgerNo?`<span class="mdot"></span><span><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> ${b.ledgerNo}</span>`:''}</div></div><div class="bc-right"><div class="bc-amt">₹${fmt(bal)}</div><div class="bc-amtl">${currentLang==='en'?'Balance':'இருப்பு'}</div></div></div><div class="bc-foot"><div class="bc-pw"><div class="bc-pl"><span>₹${fmt(b.paid)} ${currentLang==='en'?'paid':'செலுத்தியது'}</span><span>${pct}%</span></div><div class="bc-pt"><div class="bc-pf" style="width:${pct}%"></div></div></div>${dbdg}</div></div>`;
  }).join('');
}
function openDetail(id){
  const b=borrowers.find(x=>x.id===id);if(!b)return;curB=b;
  const bal=Math.max(0,b.amount-b.paid),pct=Math.round((b.paid/b.amount)*100);
  const S=(eid,v)=>{const e=document.getElementById(eid);if(e)e.textContent=v;};
  S('det-avatar',b.initials);S('det-name',b.name);S('det-phone',b.phone);S('det-address-top',b.address);
  S('det-amount','₹'+fmt(b.amount));S('det-paid','₹'+fmt(b.paid));S('det-balance','₹'+fmt(bal));
  S('det-prog-pct',pct+'%');document.getElementById('det-prog-fill').style.width=pct+'%';
  S('det-aadhaar',b.aadhaar||'—');S('det-address',b.address);S('det-agent',b.agent||'—');
  // Alt phone
  const altPhRow=document.getElementById('det-alt-phone-row');
  if(altPhRow){altPhRow.style.display=b.altPhone?'flex':'none';S('det-alt-phone',b.altPhone||'—');}
  // Ledger number
  const ledRow=document.getElementById('det-ledger-row');
  if(ledRow){ledRow.style.display=b.ledgerNo?'flex':'none';S('det-ledger-no',b.ledgerNo||'—');}
  S('det-interest',b.interest+'% per instalment');S('det-freq',cap(b.freq));
  S('det-tenure',b.tenure+' instalments');S('det-startdate',fmtD(b.startDate));S('det-emi','₹'+fmt(getEMI(b)));
  // Chit ID
  const chitEl=document.getElementById('det-chit-id');if(chitEl)chitEl.textContent=b.chitId||('#'+b.id);
  // Bank / KYC
  const bdSection=document.getElementById('det-bank-section');
  if(bdSection){
    if(b.pan||b.aadhaar||b.nomineeName){
      bdSection.style.display='';
      S('det-aadhaar',b.aadhaar||'—');S('det-pan',b.pan||'—');
      const nomRow=document.getElementById('det-nominee-row');if(nomRow)nomRow.style.display=b.nomineeName?'flex':'none';
      const nomRelRow=document.getElementById('det-nominee-rel-row');if(nomRelRow)nomRelRow.style.display=b.nomineeName?'flex':'none';
      const nomPhRow=document.getElementById('det-nominee-ph-row');if(nomPhRow)nomPhRow.style.display=b.nomineeName?'flex':'none';
      S('det-nominee-name',b.nomineeName||'—');S('det-nominee-relation',b.nomineeRelation||'—');S('det-nominee-phone',b.nomineePhone||'—');
    } else {bdSection.style.display='none';}
  }
  const bkSection=document.getElementById('det-bankinfo-section');
  if(bkSection){
    if(b.bankName||b.bankAcc){
      bkSection.style.display='';
      S('det-bank-name',b.bankName||'—');S('det-bank-acc',b.bankAcc||'—');S('det-ifsc',b.ifsc||'—');S('det-acc-type',b.accType||'—');
    } else {bkSection.style.display='none';}
  }
  // Referral
  const refSection=document.getElementById('det-referral-section');
  if(refSection){
    if(b.referral&&b.referral.name){
      refSection.style.display='';
      S('det-ref-name',b.referral.name||'—');S('det-ref-phone',b.referral.phone||'—');S('det-ref-chitid',b.referral.chitId?'#'+b.referral.chitId:'—');S('det-ref-address',b.referral.address||'—');S('det-ref-relation',b.referral.relation||'—');
    } else {refSection.style.display='none';}
  }
  const sbdg=document.getElementById('det-status');if(sbdg){sbdg.className='sbdg '+(b.status==='active'?'s-active':b.status==='overdue'?'s-overdue':'s-closed');sbdg.textContent=cap(b.status);}
  const ph=document.getElementById('det-payments');
  if(ph){
    // Build full installment schedule
    const emi=getEMI(b);
    const tenure=b.tenure||0;
    // Build a date sequence for due dates
    const startDate=b.startDate?new Date(b.startDate):new Date();
    const freqDays={daily:1,weekly:7,monthly:30};
    const step=freqDays[b.freq]||1;

    // Map existing payments by install number (in order received)
    const paidList=[...b.payments].reverse(); // oldest first

    if(!tenure){
      ph.innerHTML='<div class="sch-empty">No installment schedule available. Add tenure when registering the borrower.</div>';
    } else {
      let rows='';
      for(let i=1;i<=tenure;i++){
        const dueDate=new Date(startDate);
        dueDate.setDate(dueDate.getDate()+(i-1)*step);
        const dueDateStr=fmtD(dueDate.toISOString().split('T')[0]);
        const today=new Date();today.setHours(0,0,0,0);
        const payment=paidList[i-1]||null;
        const isPaid=!!payment;
        const isOverdue=!isPaid&&dueDate<today;
        const isFuture=!isPaid&&dueDate>=today;

        let rowClass='sch-row '+(isPaid?'sch-paid-row':isOverdue?'sch-overdue-row':'sch-future-row');
        let paidDateCell='';
        if(isPaid){
          paidDateCell=`<span class="sch-paid-d">${payment.time||dueDateStr}</span>`;
        } else if(isOverdue){
          paidDateCell=`<span class="sch-paid-d overdue-d">Overdue</span>`;
        } else {
          paidDateCell=`<span class="sch-paid-d future-d">—</span>`;
        }

        let modeChip='';
        if(isPaid){
          const m=(payment.mode||'Cash').toLowerCase();
          const mClass=m==='cash'?'sch-mode-cash':m==='upi'?'sch-mode-upi':'sch-mode-bank';
          modeChip=`<span class="sch-mode-chip ${mClass}">${payment.mode||'CASH'}</span>`;
        } else {
          modeChip=`<span class="sch-future-lbl">—</span>`;
        }

        let sigCell=isPaid?'<div class="sch-sig-done">✓</div>':'<div class="sch-sig-box"></div>';

        rows+=`<div class="${rowClass}">
          <span class="sch-no">${i}</span>
          <span class="sch-due-d">${dueDateStr}</span>
          ${paidDateCell}
          <span class="sch-amt-d">₹${fmt(emi)}</span>
          <span style="display:flex;justify-content:center;padding:0 2px">${modeChip}</span>
          <span>${sigCell}</span>
        </div>`;
      }
      ph.innerHTML=rows;
    }
  }
  gotoScreen('screen-detail');
}
function selectFreq(f){selectedFreq=f;calcEMI();}
function handleDurationChange(){
  const durType=document.getElementById('f-duration-type').value;
  const manWrap=document.getElementById('duration-manual-wrap');
  const hint=document.getElementById('duration-unit-hint');
  const interestNote=document.getElementById('interest-monthly-note');
  const tenureNote=document.getElementById('tenure-monthly-note');
  const interestInp=document.getElementById('f-interest');
  const tenureInp=document.getElementById('f-tenure');
  if(!durType){manWrap.style.display='none';return;}
  manWrap.style.display='block';
  const labels={custom:'Enter number of days',daily:'Enter number of days',weekly:'Enter number of weeks',monthly:'Enter number of months'};
  const labelsTa={custom:'நாட்களின் எண்ணிக்கை உள்ளிடவும்',daily:'நாட்களின் எண்ணிக்கை உள்ளிடவும்',weekly:'வாரங்களின் எண்ணிக்கை உள்ளிடவும்',monthly:'மாதங்களின் எண்ணிக்கை உள்ளிடவும்'};
  hint.textContent=currentLang==='ta'?(labelsTa[durType]||''):( labels[durType]||'');
  if(durType==='monthly'){
    interestInp.style.borderColor='var(--g1)';interestInp.style.background='rgba(16,110,86,0.07)';
    tenureInp.style.borderColor='var(--g1)';tenureInp.style.background='rgba(16,110,86,0.07)';
    interestNote.style.display='block';tenureNote.style.display='block';
  } else {
    interestInp.style.borderColor='';interestInp.style.background='';
    tenureInp.style.borderColor='';tenureInp.style.background='';
    interestNote.style.display='none';tenureNote.style.display='none';
  }
  calcEndDateAuto();calcEMI();
}
function calcEndDateAuto(){
  const startVal=document.getElementById('f-startdate').value;
  const durVal=parseInt(document.getElementById('f-duration-value').value)||0;
  const durType=document.getElementById('f-duration-type').value;
  const endInp=document.getElementById('f-enddate');
  if(!startVal||!durVal||!durType){endInp.value='';return;}
  const start=new Date(startVal);
  let end=new Date(start);
  if(durType==='custom'||durType==='daily') end.setDate(start.getDate()+durVal);
  else if(durType==='weekly') end.setDate(start.getDate()+durVal*7);
  else if(durType==='monthly') end.setMonth(start.getMonth()+durVal);
  const dd=String(end.getDate()).padStart(2,'0'),mm=String(end.getMonth()+1).padStart(2,'0'),yyyy=end.getFullYear();
  endInp.value=dd+'-'+mm+'-'+yyyy;
}
function calcExpectedReturn(){
  const amt=parseFloat(document.getElementById('f-amount').value)||0;
  const ded=parseFloat(document.getElementById('f-deducted').value)||0;
  const rate=parseFloat(document.getElementById('f-interest').value)||0;
  const tenure=parseInt(document.getElementById('f-tenure').value)||0;
  const freq=document.getElementById('f-colltype')?document.getElementById('f-colltype').value:'daily';
  const ret=document.getElementById('f-expected-return');
  const hand=document.getElementById('f-amount-in-hand');
  // Amount in Hand = what borrower physically receives
  if(hand)hand.value=amt>0?'₹'+fmt(amt-ded):'';
  // Expected Return = full loan amount (borrower repays full, deducted was upfront fee)
  if(ret)ret.value=amt>0?'₹'+fmt(amt):'';
}
function calcEMI(){
  const amt=parseFloat(document.getElementById('f-amount').value)||0;
  const rate=parseFloat(document.getElementById('f-interest').value)||0;
  const tenure=parseInt(document.getElementById('f-tenure').value)||0;
  const freq=document.getElementById('f-colltype')?document.getElementById('f-colltype').value:selectedFreq;
  calcExpectedReturn();
  const res=document.getElementById('calc-result');if(!amt||!tenure){res.classList.remove('show');return;}
  const ti=amt*(rate/100)*(freq==='monthly'?tenure:tenure/30),emi=Math.round((amt+ti)/tenure);
  const S=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  S('cr-principal','₹'+fmt(amt));S('cr-interest','₹'+fmt(ti));S('cr-emi','₹'+fmt(emi));S('cr-total','₹'+fmt(amt+ti));
  res.classList.add('show');
}
function getNextChitId(){return borrowers.length?Math.max(...borrowers.map(b=>typeof b.chitId==='number'?b.chitId:(parseInt((b.chitId||'0').split('-').pop())||b.id)))+1:1;}
function fmtChitId(n){return (currentCompanyCode||'CO')+'-'+String(n).padStart(3,'0');}
function updateChitIdPreview(){
  const nid=getNextChitId();
  const formatted=fmtChitId(nid);
  const el=document.getElementById('next-chit-id');if(el)el.textContent=formatted;
  const cc=document.getElementById('chit-company-code-disp');if(cc)cc.textContent=currentCompanyCode||'—';
  const lh=document.getElementById('ledger-hint-id');if(lh)lh.textContent=formatted;
}
function toggleReferral(){
  const fields=document.getElementById('referral-fields'),ico=document.getElementById('ref-toggle-ico');
  const open=fields.style.display==='none';
  fields.style.display=open?'block':'none';
  if(ico)ico.textContent=open?'−':'＋';
}
function lookupReferrer(){
  const raw=(document.getElementById('f-ref-chitid')?.value||'').trim();
  const msgEl=document.getElementById('ref-lookup-msg');
  const nameEl=document.getElementById('f-ref-name');
  const phoneEl=document.getElementById('f-ref-phone');
  const addrEl=document.getElementById('f-ref-address');
  if(!raw){
    if(msgEl)msgEl.style.display='none';
    [nameEl,phoneEl,addrEl].forEach(el=>{if(el){el.readOnly=false;el.style.background='';}});
    return;
  }
  // Match by full chitId string (case-insensitive) or by numeric portion
  const rawUp=raw.toUpperCase();
  const rawNum=parseInt(raw.replace(/[^0-9]/g,''));
  const match=borrowers.find(b=>{
    if(b.chitId&&String(b.chitId).toUpperCase()===rawUp)return true;
    if(!isNaN(rawNum)&&b.chitIdNum===rawNum)return true;
    return false;
  });
  if(match){
    nameEl.value=match.name||'';
    phoneEl.value=match.phone||'';
    addrEl.value=match.address||'';
    [nameEl,phoneEl,addrEl].forEach(el=>{if(el){el.readOnly=true;el.style.background='var(--surf)';}});
    if(msgEl){
      msgEl.style.display='block';
      msgEl.style.color='var(--em)';
      msgEl.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><polyline points="20 6 9 17 4 12"/></svg> Existing customer found — details auto-filled from '+(match.chitId||('#'+match.id))+'.';
    }
  }else{
    [nameEl,phoneEl,addrEl].forEach(el=>{if(el){el.readOnly=false;el.style.background='';}});
    if(msgEl){
      msgEl.style.display='block';
      msgEl.style.color='var(--amber)';
      msgEl.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> No matching Chit ID found — enter referrer details manually.';
    }
  }
}
function saveBorrower(){try{
  const name=document.getElementById('f-name').value.trim(),phone=document.getElementById('f-phone').value.trim(),address=document.getElementById('f-address').value.trim(),amount=parseFloat(document.getElementById('f-amount').value)||0;
  if(!name||!phone||!address||!amount){showToast('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> '+(currentLang==='en'?'Please fill required fields':'கட்டாயமான தகவல்களை நிரப்பவும்'));return;}
  const chitIdNum=getNextChitId();
  const chitId=fmtChitId(chitIdNum);
  // Referral data (only if section is open/filled)
  const refName=(document.getElementById('f-ref-name')?.value||'').trim();
  const referral=refName?{name:refName,phone:(document.getElementById('f-ref-phone')?.value||'').trim(),chitId:(document.getElementById('f-ref-chitid')?.value||'').trim(),address:(document.getElementById('f-ref-address')?.value||'').trim(),relation:(document.getElementById('f-ref-relation')?.value||'')}:null;
  const b={
    id:nextBorrowerId++,chitId,chitIdNum,name,phone,address,
    altPhone:(document.getElementById('f-alt-phone')?.value||'').trim(),
    aadhaar:document.getElementById('f-aadhaar').value.trim(),
    pan:(document.getElementById('f-pan')?.value||'').trim().toUpperCase(),
    nomineeName:(document.getElementById('f-nominee-name')?.value||'').trim(),
    nomineeRelation:(document.getElementById('f-nominee-relation')?.value||'').trim(),
    nomineePhone:(document.getElementById('f-nominee-phone')?.value||'').trim(),
    bankName:(document.getElementById('f-bank-name')?.value||'').trim(),
    bankAcc:(document.getElementById('f-bank-acc')?.value||'').trim(),
    ifsc:(document.getElementById('f-ifsc')?.value||'').trim().toUpperCase(),
    accType:(document.getElementById('f-acc-type')?.value||''),
    ledgerNo:(document.getElementById('f-ledger-no')?.value||'').trim(),
    referral,
    amount,interest:parseFloat(document.getElementById('f-interest').value)||2,
    freq:document.getElementById('f-colltype')?document.getElementById('f-colltype').value:selectedFreq,
    durationType:document.getElementById('f-duration-type').value,
    durationValue:parseInt(document.getElementById('f-duration-value').value)||0,
    endDate:document.getElementById('f-enddate').value,
    tenure:parseInt(document.getElementById('f-tenure').value)||100,
    startDate:document.getElementById('f-startdate').value,
    paid:0,status:'active',
    initials:name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2),
    payments:[]
  };
  borrowers.push(b);saveCurrentCompany();
  ['f-name','f-phone','f-alt-phone','f-aadhaar','f-address','f-amount','f-pan','f-nominee-name','f-nominee-relation','f-nominee-phone','f-bank-name','f-bank-acc','f-ifsc','f-ledger-no','f-ref-name','f-ref-phone','f-ref-chitid','f-ref-address'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  ['f-ref-name','f-ref-phone','f-ref-address'].forEach(id=>{const e=document.getElementById(id);if(e){e.readOnly=false;e.style.background='';}});
  const rlm=document.getElementById('ref-lookup-msg');if(rlm)rlm.style.display='none';
  const fat=document.getElementById('f-acc-type');if(fat)fat.value='';
  const frt=document.getElementById('f-ref-relation');if(frt)frt.value='';
  // Close referral if open
  const rf=document.getElementById('referral-fields');if(rf)rf.style.display='none';
  const ri=document.getElementById('ref-toggle-ico');if(ri)ri.textContent='＋';
  document.getElementById('f-interest').value='2';document.getElementById('f-tenure').value='';
  document.getElementById('f-deducted').value='0';
  const fdt=document.getElementById('f-duration-type');if(fdt)fdt.value='';
  const fdv=document.getElementById('f-duration-value');if(fdv)fdv.value='';
  const fend=document.getElementById('f-enddate');if(fend)fend.value='';
  const fer=document.getElementById('f-expected-return');if(fer)fer.value='';
  const fah=document.getElementById('f-amount-in-hand');if(fah)fah.value='';
  const fer2=document.getElementById('f-expected-return');if(fer2)fer2.value='';
  const dmw=document.getElementById('duration-manual-wrap');if(dmw)dmw.style.display='none';
  const iInp=document.getElementById('f-interest');if(iInp){iInp.style.borderColor='';iInp.style.background='';}
  const tInp=document.getElementById('f-tenure');if(tInp){tInp.style.borderColor='';tInp.style.background='';}
  const imn=document.getElementById('interest-monthly-note');if(imn)imn.style.display='none';
  const tmn=document.getElementById('tenure-monthly-note');if(tmn)tmn.style.display='none';
  document.getElementById('calc-result').classList.remove('show');
  updateStats();renderBorrowers();gotoScreen('screen-home');
  showToast('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><polyline points="20 6 9 17 4 12"/></svg> '+name+' ('+chitId+') '+(currentLang==='en'?'added!':'சேர்க்கப்பட்டது!'));
}catch(e){showToast('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Error saving borrower.');console.warn('save err',e);}}
function openCollectModal(){if(curB){openQuickCollect();setTimeout(()=>selectCustomer(curB.id),100);}else openQuickCollect();}
let selectedCustomerId=null;
let dueCount_=1;
let perDueAmt_=150;
function openQuickCollect(){
  selectedCustomerId=null;dueCount_=1;
  document.getElementById('collect-amount').value='';
  document.getElementById('collect-btn-amt').textContent='₹0';
  document.getElementById('due-count-badge').textContent='× 1 due';
  const sc=document.getElementById('cs-section');if(sc)sc.style.display='';
  const st=document.getElementById('sel-cust-tag');if(st)st.style.display='none';
  document.getElementById('customer-search').value='';
  renderCsList(borrowers.filter(b=>b.status==='active'));
  document.getElementById('collect-modal').classList.add('open');
  selMode('cash');document.getElementById('coll-ok').classList.remove('show');
  const cd=document.getElementById('collect-date');if(cd)cd.value=new Date().toISOString().split('T')[0];
}
function closeCollect(){document.getElementById('collect-modal').classList.remove('open');}
function closeCollBg(e){if(e.target===document.getElementById('collect-modal'))closeCollect();}
function renderCsList(list){
  const el=document.getElementById('customer-list');if(!el)return;
  el.innerHTML=list.map(b=>`<div class="cs-opt ${selectedCustomerId===b.id?'sel':''}" onclick="selectCustomer(${b.id})"><div class="cs-ava">${b.initials}</div><div class="cs-info"><div class="cs-name">${b.name}</div><div class="cs-phone">${b.phone}</div></div><div class="cs-bal">₹${fmt(b.amount-b.paid)}</div>${selectedCustomerId===b.id?'<span class="cs-chk">✓</span>':''}</div>`).join('');
  if(!list.length)el.innerHTML='<div style="padding:12px;text-align:center;font-size:11px;color:var(--tx3)">'+(currentLang==='en'?'No active borrowers':'செயலில் உள்ள கடன்தாரர்கள் இல்லை')+'</div>';
}
function filterCsList(){const q=(document.getElementById('customer-search').value||'').toLowerCase();renderCsList(borrowers.filter(b=>b.status==='active'&&(b.name.toLowerCase().includes(q)||b.phone.includes(q))));}
function selectCustomer(id){
  selectedCustomerId=id;const b=borrowers.find(x=>x.id===id);if(!b)return;
  const sc=document.getElementById('cs-section');if(sc)sc.style.display='none';
  const st=document.getElementById('sel-cust-tag');if(st)st.style.display='flex';
  const ava=document.getElementById('sct-ava');if(ava)ava.textContent=b.initials;
  const nm=document.getElementById('sct-name');if(nm)nm.textContent=b.name;
  const ph=document.getElementById('sct-phone');if(ph)ph.textContent=b.phone;
  const bal=Math.max(0,b.amount-b.paid);
  const emi=getEMI(b);
  perDueAmt_=emi||150;
  const dues=emi>0?Math.ceil(bal/emi):0;
  const pd=document.getElementById('sct-pending');if(pd)pd.textContent='₹'+fmt(bal)+' ('+dues+' dues)';
  const pl=document.getElementById('due-per-lbl');if(pl)pl.textContent='₹'+fmt(perDueAmt_)+' / due';
  dueCount_=1;
  updateDueUI();
  renderCsList(borrowers.filter(x=>x.status==='active'));
}
function clearCsSelection(){
  selectedCustomerId=null;
  const sc=document.getElementById('cs-section');if(sc)sc.style.display='';
  const st=document.getElementById('sel-cust-tag');if(st)st.style.display='none';
  dueCount_=1;perDueAmt_=150;
  document.getElementById('collect-amount').value='';
  document.getElementById('due-count-badge').textContent='× 1 due';
  document.getElementById('collect-btn-amt').textContent='₹0';
  document.getElementById('due-per-lbl').textContent='₹150 / due';
  renderCsList(borrowers.filter(b=>b.status==='active'));
}
function changeDue(d){
  dueCount_=Math.max(1,dueCount_+d);
  updateDueUI();
}
function resetDue(){dueCount_=1;updateDueUI();}
function updateDueUI(){
  const amt=dueCount_*perDueAmt_;
  document.getElementById('collect-amount').value=amt;
  document.getElementById('due-count-badge').textContent='× '+dueCount_+' due'+(dueCount_>1?'s':'');
  document.getElementById('collect-btn-amt').textContent='₹'+fmt(amt);
}
function onDueManualInput(){
  const v=parseFloat(document.getElementById('collect-amount').value)||0;
  dueCount_=perDueAmt_>0?Math.round(v/perDueAmt_)||1:1;
  document.getElementById('due-count-badge').textContent='× '+dueCount_+' due'+(dueCount_>1?'s':'');
  document.getElementById('collect-btn-amt').textContent='₹'+fmt(v);
}
function setAmt(v){document.getElementById('collect-amount').value=v;document.getElementById('collect-btn-amt').textContent='₹'+fmt(v);}
function selMode(m){selMode_=m;
  ['cash','upi'].forEach(x=>{const el=document.getElementById('mode-'+x);if(el)el.classList.toggle('sel',x===m);});
  /* keep bank/cheque elements working if they exist elsewhere */
  ['bank','cheque'].forEach(x=>{const el=document.getElementById('mode-'+x);if(el)el.classList.toggle('sel',x===m);});
}
function confirmColl(){try{
  if(!selectedCustomerId){showToast('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> '+(currentLang==='en'?'Please select a customer first':'முதலில் வாடிக்கையாளரை தேர்ந்தெடுக்கவும்'));return;}
  const amt=parseFloat(document.getElementById('collect-amount').value)||0;
  if(!amt){showToast('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> '+(currentLang==='en'?'Please enter an amount':'தொகையை உள்ளிடவும்'));return;}
  const b=borrowers.find(x=>x.id===selectedCustomerId);if(!b)return;
  b.paid+=amt;if(b.paid>=b.amount)b.status='closed';
  collectedToday+=amt;todayTxns++;
  const hr=new Date().getHours();
  if(hr<12)morAmt+=amt;else if(hr<17)aftAmt+=amt;else eveAmt+=amt;
  const modeMap={cash:'Cash',upi:'UPI',bank:'Bank',cheque:'Cheque'};
  const timeStr=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
  const payRec={amount:amt,mode:modeMap[selMode_]||'Cash',time:timeStr,agent:currentRole==='agent'?'Field Agent':'Office'};
  b.payments.unshift(payRec);
  feedItems.unshift({bid:b.id,initials:b.initials,name:b.name,agent:payRec.agent,time:timeStr,amount:amt,mode:payRec.mode});
  const ci=collectors.find(c=>c.name===payRec.agent);
  if(ci){ci.collections++;ci.amount+=amt;}else collectors.push({name:payRec.agent,collections:1,amount:amt});
  saveCurrentCompany();
  const ok=document.getElementById('coll-ok'),okt=document.getElementById('coll-ok-txt');
  if(ok&&okt){okt.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> ₹'+fmt(amt)+' from '+b.name+' recorded!';ok.classList.add('show');}
  updateStats();renderBorrowers();renderReports();renderBars();renderFeed();
  if(curB&&document.getElementById('screen-detail').classList.contains('active'))openDetail(curB.id);
  const sv=document.getElementById('stat-today');if(sv){sv.classList.add('pulse-now');setTimeout(()=>sv.classList.remove('pulse-now'),500);}
  showToast('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><polyline points="20 6 9 17 4 12"/></svg> ₹'+fmt(amt)+' '+(currentLang==='en'?'from '+b.name+' recorded!':''+b.name+' வசூல் பதிவாகியது!'));
  setTimeout(()=>{ok.classList.remove('show');closeCollect();},2500);
}catch(e){showToast('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Error recording payment. Try again.');console.warn('coll err',e);}}
function openCDMFromFeed(id){const b=borrowers.find(x=>x.id===id);if(b)showCDM(b);}
function showCDM(b){
  cdmB=b;const bal=Math.max(0,b.amount-b.paid),pct=Math.round((b.paid/b.amount)*100);
  const S=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  document.getElementById('cdm-ava').textContent=b.initials;
  S('cdm-name',b.name);S('cdm-phone',b.phone);S('cdm-addr',b.address);
  S('cdm-chitid',b.chitId||('#'+b.id));
  if(b.aadhaar){S('cdm-aadhaar',b.aadhaar);document.getElementById('cdm-arow').style.display='flex';}
  else document.getElementById('cdm-arow').style.display='none';
  S('cdm-loan','₹'+fmt(b.amount));S('cdm-paid','₹'+fmt(b.paid));S('cdm-bal','₹'+fmt(bal));S('cdm-emi','₹'+fmt(getEMI(b)));
  document.getElementById('cdm-prog-pct').textContent=pct+'%';document.getElementById('cdm-prog-fill').style.width=pct+'%';
  S('cdm-interest',b.interest+'% per instalment');S('cdm-freq',cap(b.freq));
  S('cdm-tenure',b.tenure+' instalments');S('cdm-start',fmtD(b.startDate));S('cdm-status',cap(b.status));S('cdm-agent',b.agent||'—');
  document.getElementById('cdm').classList.add('open');
}
function closeCDM(){document.getElementById('cdm').classList.remove('open');}
function closeCDMBg(e){if(e.target===document.getElementById('cdm'))closeCDM();}
function openDetailFromCDM(){if(cdmB){closeCDM();openDetail(cdmB.id);}}
function renderFeed(){
  const feed=document.getElementById('live-feed'),lbl=document.getElementById('feed-lbl');
  if(lbl)lbl.textContent=(currentLang==='en'?'Today: ':'இன்று: ')+todayTxns;
  if(!feedItems.length){feed.innerHTML='<div class="feed-empty">'+(currentLang==='en'?'No collections recorded today. Tap Collect below to begin.':'இன்று வசூல் ஏதும் பதிவு செய்யப்படவில்லை. வசூல் பொத்தானை அழுத்துங்கள்.')+'</div>';return;}
  feed.innerHTML=feedItems.map(item=>`<div class="feed-item" onclick="openCDMFromFeed(${item.bid})"><div class="feed-ava">${item.initials}</div><div class="feed-info"><div class="feed-name">${item.name}</div><div class="feed-meta">by ${item.agent} · ${item.time}</div></div><div><div class="feed-amt">+₹${fmt(item.amount)}</div><span class="feed-mode">${item.mode}</span></div></div>`).join('');
}
function renderBars(){
  const c=document.getElementById('weekly-bars');if(!c)return;
  const data=[...wkData];data[6]=collectedToday;const mx=Math.max(...data,1);
  const dn=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],lbls=[];
  for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);lbls.push(dn[d.getDay()]);}
  c.innerHTML=data.map((v,i)=>{const pct=Math.round((v/mx)*100),isT=i===6;return`<div class="bw ${isT?'tod':''}"><div class="bar-val">₹${v>=1000?Math.round(v/1000)+'k':v}</div><div class="bar ${isT?'b-today':'b-prev'}" style="height:${Math.max(4,pct)}%"></div><div class="bar-lbl">${lbls[i]}</div></div>`;}).join('');
}

function renderCollectors(){
  const el=document.getElementById('collector-list');if(!el)return;
  if(!collectors.length){el.innerHTML='<div style="text-align:center;padding:12px;font-size:11px;color:var(--tx3)">'+(currentLang==='en'?'No collections today yet':'இன்று வசூல் ஏதும் இல்லை')+'</div>';return;}
  const sorted=[...collectors].sort((a,b)=>b.amount-a.amount),mx=sorted[0]?.amount||1;
  el.innerHTML=sorted.map((c,i)=>{const rc=['r1','r2','r3'][i]||'rn',pct=Math.round((c.amount/mx)*100);return`<div class="coll-row"><div class="coll-rank ${rc}">${i+1}</div><div class="coll-info"><div class="coll-name">${c.name}</div><div class="coll-cnt">${c.collections} collection${c.collections>1?'s':''}</div></div><div class="coll-bar-w"><div class="coll-bar"><div class="coll-fill" style="width:${pct}%"></div></div></div><div class="coll-amt">₹${fmt(c.amount)}</div></div>`;}).join('');
}
function renderReports(){
  const act=borrowers.filter(b=>b.status==='active');
  const tl=act.reduce((s,b)=>s+b.amount,0),tp=act.reduce((s,b)=>s+b.paid,0),rate=tl>0?Math.round((tp/tl)*100):0;
  const S=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  S('rep-total','₹'+fmt(tl));S('rep-collected','₹'+fmt(tp));S('rep-pending-r','₹'+fmt(tl-tp));S('rep-borrowers',act.length);
  S('rep-today','₹'+fmt(collectedToday));S('rep-week','₹'+fmt(weeklyTotal));S('rep-month','₹'+fmt(monthlyTotal));
  S('kpi-today','₹'+fmt(collectedToday));S('kpi-txns',todayTxns);
  S('kpi-txns-ch',collectors.length+' collector'+(collectors.length>1?'s':'')+' active');
  S('kpi-week','₹'+fmt(weeklyTotal));S('kpi-rate',rate+'%');
  const rc=document.getElementById('kpi-rate-cls');if(rc){rc.className='kpi-ch '+(rate>=50?'k-up':'k-dn');rc.textContent=currentLang==='en'?'of portfolio':'போர்ட்ஃபோலியோவில்';}
  const slotMx=Math.max(morAmt,aftAmt,eveAmt,1);
  S('tb-morning',morAmt>0?'₹'+fmt(morAmt):'—');S('tb-afternoon',aftAmt>0?'₹'+fmt(aftAmt):'—');S('tb-evening',eveAmt>0?'₹'+fmt(eveAmt):'—');
  const sw=(id,v)=>{const e=document.getElementById(id);if(e)e.style.width=Math.round((v/slotMx)*100)+'%';};
  sw('tbf-morning',morAmt);sw('tbf-afternoon',aftAmt);sw('tbf-evening',eveAmt);
  renderCollectors();
  renderAllReportSections();
}
function repTodayClick(){showToast('Today: ₹'+fmt(collectedToday)+' from '+todayTxns+' txns');}
function repWeekClick(){showToast('This week: ₹'+fmt(weeklyTotal));}
function repMonthClick(){showToast('This month: ₹'+fmt(monthlyTotal));}
function doLogout(){saveCurrentCompany();document.getElementById('ai-fab').style.display='none';const sb=document.getElementById('global-sidebar');if(sb)sb.style.display='none';aiHistory=[];borrowers=[];currentCompanyCode=null;document.getElementById('pw-input').value='';document.getElementById('code-input').value='';const w=document.getElementById('login-warn');if(w)w.style.display='none';collectedToday=0;todayTxns=0;weeklyTotal=0;monthlyTotal=0;morAmt=0;aftAmt=0;eveAmt=0;feedItems=[];notifs=[];collectors=[];curB=null;cdmB=null;currentCompanyCode=null;document.getElementById('code-input').value='';gotoScreen('screen-login');}
function getEMI(b){const ti=b.amount*(b.interest/100)*(b.freq==='monthly'?b.tenure:b.tenure/30);return Math.round((b.amount+ti)/b.tenure);}
function fmt(n){if(!n)return'0';if(n>=10000000)return(n/10000000).toFixed(1)+'Cr';if(n>=100000)return(n/100000).toFixed(1)+'L';return Math.round(n).toLocaleString('en-IN');}
function fmtD(d){if(!d)return'—';return new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});}
function cap(s){return s?s[0].toUpperCase()+s.slice(1):'';}
function showToast(msg){const t=document.getElementById('toast');t.innerHTML=msg;t.classList.add('show');clearTimeout(toastTmr);toastTmr=setTimeout(()=>t.classList.remove('show'),2800);}

/* ══════════════════════════════════════════════════
   REPORTS v2 — Render functions
══════════════════════════════════════════════════ */

function renderTodayTxns(){
  const el=document.getElementById('today-txn-rows');if(!el)return;
  // Update summary strip
  const totalEl=document.getElementById('tss-total');
  const countEl=document.getElementById('tss-count');
  const agentsEl=document.getElementById('tss-agents');
  if(totalEl)totalEl.textContent='₹'+fmt(collectedToday);
  if(countEl)countEl.textContent=todayTxns;
  if(agentsEl)agentsEl.textContent=collectors.length;

  if(!feedItems.length){
    el.innerHTML='<div class="txn-empty">No collections recorded today. Start collecting to see entries here.</div>';
    return;
  }
  el.innerHTML=feedItems.map((item,i)=>{
    const modeClass=item.mode.toLowerCase()==='cash'?'cash':'upi';
    return `<div class="txn-row" onclick="openCDMFromFeed(${item.bid})">
      <span class="txn-sno">${feedItems.length-i}</span>
      <span class="txn-name">${item.name}</span>
      <span class="txn-time">${item.time}</span>
      <span style="display:flex;justify-content:flex-end"><span class="txn-mode-chip ${modeClass}">${item.mode}</span></span>
      <span class="txn-amt">+₹${fmt(item.amount)}</span>
      <span class="txn-agent">${item.agent}</span>
    </div>`;
  }).join('');
}

function renderWeekBars(){
  const card=document.getElementById('week-bars-card');
  const rows=document.getElementById('week-day-rows');
  if(!card||!rows)return;
  const dn=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const data=[...wkData];data[6]=collectedToday;
  const labels=[];
  for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);labels.push(dn[d.getDay()]);}
  const monOrder=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const dayMap={};
  labels.forEach((lbl,i)=>{dayMap[lbl]={val:data[i],isToday:i===6};});
  const sorted=monOrder.map(d=>({day:d,val:dayMap[d]?dayMap[d].val:0,isToday:dayMap[d]?dayMap[d].isToday:false}));
  const mx=Math.max(...sorted.map(d=>d.val),1);
  const BAR_MAX_PX=72; // max bar height in px

  // Bar chart — use px heights for reliability
  card.innerHTML=`
  <div style="font-size:9px;font-weight:600;color:var(--tx3);margin-bottom:8px;text-transform:uppercase;letter-spacing:.4px">Weekly Overview (Mon–Sun)</div>
  <div class="week-bars-inner">
    ${sorted.map(d=>{
      const px=Math.round((d.val/mx)*BAR_MAX_PX);
      const barH=d.val>0?Math.max(4,px):2;
      const valStr=d.val>=1000?(d.val/1000).toFixed(0)+'k':(d.val>0?d.val:'');
      const barColor=d.isToday?'linear-gradient(180deg,#00C48C,#00A07A)':'var(--surf2)';
      const lblColor=d.isToday?'color:var(--em);font-weight:800':'color:var(--tx3)';
      const valColor=d.isToday?'color:var(--em)':'color:var(--tx3)';
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end">
        <div style="font-size:7px;font-weight:700;${valColor};white-space:nowrap;margin-bottom:2px;min-height:10px">${valStr}</div>
        <div style="width:80%;height:${barH}px;border-radius:3px 3px 0 0;background:${barColor};flex-shrink:0"></div>
        <div style="font-size:9px;font-weight:600;${lblColor};margin-top:5px">${d.day}</div>
      </div>`;
    }).join('')}
  </div>
  <div style="border-top:1px solid var(--bdr);margin-top:6px;padding-top:7px;display:flex;justify-content:space-between;align-items:center">
    <span style="font-size:9px;color:var(--tx3)">Week Total</span>
    <span style="font-size:13px;font-weight:800;color:var(--tx);font-family:var(--disp)">₹${fmt(sorted.reduce((s,d)=>s+d.val,0))}</span>
  </div>`;

  // Day rows
  rows.innerHTML=sorted.map(d=>{
    const pct=mx>0?Math.round((d.val/mx)*100):0;
    return `<div class="wdr-row${d.isToday?' wdr-today':''}">
      <div class="wdr-day">${d.day}</div>
      ${d.isToday?'<div class="wdr-today-badge">TODAY</div>':'<div style="width:38px"></div>'}
      <div class="wdr-bar-wrap">
        <div class="wdr-bar-bg"><div class="wdr-bar-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="wdr-amt ${d.val===0?'wdr-zero':''}">${d.val>0?'₹'+fmt(d.val):'—'}</div>
    </div>`;
  }).join('');
}

function renderMonthReport(){
  const card=document.getElementById('month-weeks-card');
  const modeEl=document.getElementById('mode-breakdown');
  if(!card||!modeEl)return;

  // Week 1 = actual (collectedToday as proxy); weeks 2-4 projected
  const w1=Math.max(collectedToday,monthlyTotal>0?Math.round(monthlyTotal*0.28):0);
  const dailyAvg=w1>0?Math.round(w1/7):0;
  const w2proj=Math.round(dailyAvg*7*1.05);
  const w3proj=Math.round(dailyAvg*7*0.98);
  const w4proj=Math.round(dailyAvg*7*1.02);
  const allW=[w1,w2proj,w3proj,w4proj];
  const mx=Math.max(...allW,1);
  const weeks=[
    {label:'Week 1',dates:'Days 1–7',val:w1,actual:true},
    {label:'Week 2',dates:'Days 8–14',val:w2proj,actual:false},
    {label:'Week 3',dates:'Days 15–21',val:w3proj,actual:false},
    {label:'Week 4',dates:'Days 22–31',val:w4proj,actual:false},
  ];
  card.innerHTML=weeks.map(w=>{
    const pct=Math.round((w.val/mx)*100);
    return `<div class="mwk-row">
      <div class="mwk-header">
        <div>
          <div class="mwk-title">${w.label} <span style="font-size:10px;font-weight:500;color:var(--tx3)">(${w.dates})</span></div>
        </div>
        <span class="mwk-badge ${w.actual?'actual':'proj'}">${w.actual?'Actual':'Projected'}</span>
      </div>
      <div class="mwk-amt${w.actual?'':' proj-amt'}">₹${fmt(w.val)}</div>
      <div class="mwk-bar-bg"><div class="mwk-bar-fill ${w.actual?'actual-fill':'proj-fill'}" style="width:${pct}%"></div></div>
      ${!w.actual?`<div class="mwk-detail">Based on Week 1 daily avg of ₹${fmt(dailyAvg)}/day</div>`:''}
    </div>`;
  }).join('');

  // Payment mode breakdown from actual feedItems
  const modeTotals={};
  feedItems.forEach(item=>{
    const m=item.mode||'Cash';
    if(!modeTotals[m])modeTotals[m]={amount:0,count:0};
    modeTotals[m].amount+=item.amount;
    modeTotals[m].count++;
  });
  const total=Object.values(modeTotals).reduce((s,v)=>s+v.amount,0)||1;
  const modeColors={Cash:{bg:var_embg||'#E6FAF5',bar:'#00C48C',ico:'💵'},UPI:{bg:'#D0E4F5',bar:'#004C8F',ico:'📱'},Bank:{bg:'#FFF8EC',bar:'#F5A623',ico:'🏦'},Cheque:{bg:'#FFF0F0',bar:'#FF0000',ico:'📄'}};
  const modes=Object.keys(modeTotals).sort((a,b)=>modeTotals[b].amount-modeTotals[a].amount);

  if(!modes.length){
    modeEl.innerHTML='<div style="text-align:center;padding:14px;font-size:11px;color:var(--tx3)">No payments recorded yet. Collections will appear here.</div>';
    return;
  }
  modeEl.innerHTML=modes.map(m=>{
    const d=modeTotals[m];
    const pct=Math.round((d.amount/total)*100);
    const c=modeColors[m]||{bg:'var(--surf)',bar:'var(--g1)',ico:'💳'};
    return `<div class="mode-row">
      <div class="mode-icon-w" style="background:${c.bg}">${c.ico}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;justify-content:space-between">
          <div>
            <div class="mode-name">${m}</div>
            <div class="mode-count">${d.count} payment${d.count>1?'s':''}</div>
          </div>
          <div style="text-align:right">
            <div class="mode-amt" style="color:${c.bar}">₹${fmt(d.amount)}</div>
            <div class="mode-pct">${pct}%</div>
          </div>
        </div>
        <div class="mode-bar-bg"><div class="mode-bar-fill" style="width:${pct}%;background:${c.bar}"></div></div>
      </div>
    </div>`;
  }).join('');
}

function renderAllReportSections(){
  renderTodayTxns();
  renderWeekBars();
  renderMonthReport();
}

/* ══════════════════════════════════════════════════
   PDF EXPORT — Uses print stylesheet in new window
══════════════════════════════════════════════════ */

function getCompanyName(){return currentCompanyCode?currentCompanyCode.replace(/\d/g,'').toUpperCase()+' Finance':'DailyFinance Pro';}

function buildPDFWindow(title,bodyHTML){
  const w=window.open('','_blank','width=800,height=600');
  if(!w){showToast('⚠ Pop-up blocked — allow pop-ups and retry');return;}
  const now=new Date();
  const ds=now.toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'});
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#001A33;background:#fff;padding:28px 36px}
    .pdf-header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:14px;border-bottom:2px solid #004C8F;margin-bottom:18px}
    .pdf-co{font-size:18px;font-weight:800;color:#004C8F}
    .pdf-sub{font-size:11px;color:#3A6080;margin-top:2px}
    .pdf-title{font-size:13px;font-weight:700;color:#001A33;text-align:right}
    .pdf-date{font-size:10px;color:#3A6080;text-align:right;margin-top:2px}
    .summary-row{display:flex;gap:16px;margin-bottom:18px}
    .sum-box{flex:1;border:1.5px solid #A8C3DE;border-radius:8px;padding:10px 12px;background:#E6EFF9}
    .sum-box-val{font-size:18px;font-weight:800;color:#004C8F}
    .sum-box-lbl{font-size:9px;font-weight:600;color:#3A6080;text-transform:uppercase;letter-spacing:.5px;margin-top:2px}
    table{width:100%;border-collapse:collapse;margin-bottom:18px}
    thead th{background:#004C8F;color:#fff;padding:8px 10px;font-size:10px;font-weight:700;text-align:left;text-transform:uppercase;letter-spacing:.4px}
    tbody tr:nth-child(even){background:#E6EFF9}
    tbody td{padding:7px 10px;font-size:11px;border-bottom:1px solid #C5D9EE;vertical-align:middle}
    .chip{display:inline-block;padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700}
    .chip-cash{background:#E6FAF5;color:#00C48C}
    .chip-upi{background:#D0E4F5;color:#004C8F}
    .chip-other{background:#FFF8EC;color:#F5A623}
    .amt-cell{font-weight:800;color:#00C48C}
    .section-title{font-size:12px;font-weight:800;color:#001A33;margin:16px 0 8px;text-transform:uppercase;letter-spacing:.5px;padding-bottom:4px;border-bottom:1.5px solid #A8C3DE}
    .week-row{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #C5D9EE}
    .week-today{background:#D0E4F5;border-radius:6px;padding:8px 10px;margin:2px -10px}
    .proj-label{font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;background:#FFF8EC;color:#F5A623;border:1px solid #FDDFA0}
    .actual-label{font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;background:#E6FAF5;color:#00C48C;border:1px solid #7EECD2}
    .pdf-footer{margin-top:24px;padding-top:10px;border-top:1px solid #A8C3DE;display:flex;justify-content:space-between;font-size:9px;color:#7AAABF}
    @media print{body{padding:16px;font-size:11px}.pdf-co{font-size:16px}}
    @media print{@page{margin:12mm}}
  </style></head><body>
  <div class="pdf-header">
    <div><div class="pdf-co">${getCompanyName()}</div><div class="pdf-sub">DailyFinance Pro · Official Report</div></div>
    <div><div class="pdf-title">${title}</div><div class="pdf-date">Generated: ${ds}</div></div>
  </div>
  ${bodyHTML}
  <div class="pdf-footer"><span>${getCompanyName()} · DailyFinance Pro</span><span>Printed: ${now.toLocaleString('en-IN')}</span><span>Confidential</span></div>
  <script>window.onload=function(){window.print();}<\/script>
  </body></html>`);
  w.document.close();
}

function exportTodayPDF(){
  const now=new Date();
  const ds=now.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  let rows='';
  if(!feedItems.length){rows='<tr><td colspan="6" style="text-align:center;color:#7AAABF;padding:20px">No collections recorded today</td></tr>';}
  else{
    [...feedItems].reverse().forEach((item,i)=>{
      const mc=item.mode.toLowerCase()==='cash'?'chip-cash':'chip-upi';
      rows+=`<tr><td>${i+1}</td><td style="font-weight:700">${item.name}</td><td>${item.time}</td><td><span class="chip ${mc}">${item.mode}</span></td><td class="amt-cell">₹${fmt(item.amount)}</td><td>${item.agent}</td></tr>`;
    });
  }
  const html=`
  <div class="summary-row">
    <div class="sum-box"><div class="sum-box-val">₹${fmt(collectedToday)}</div><div class="sum-box-lbl">Total Collected</div></div>
    <div class="sum-box"><div class="sum-box-val" style="color:#3A6080">${todayTxns}</div><div class="sum-box-lbl">Total Payments</div></div>
    <div class="sum-box"><div class="sum-box-val" style="color:#F5A623">${collectors.length}</div><div class="sum-box-lbl">Agents Active</div></div>
  </div>
  <div class="section-title">Transaction Details — ${ds}</div>
  <table><thead><tr><th>#</th><th>Customer Name</th><th>Time</th><th>Mode</th><th>Amount</th><th>Agent</th></tr></thead>
  <tbody>${rows}</tbody></table>`;
  buildPDFWindow("Today's Collection Report",html);
}

function exportWeekPDF(){
  const dn=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const fullDn=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const data=[...wkData];data[6]=collectedToday;
  const labels=[];const fullLabels=[];
  for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);labels.push(dn[d.getDay()]);fullLabels.push(fullDn[d.getDay()]);}
  const monOrder=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const fullMonOrder=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const dayMap={};
  labels.forEach((lbl,i)=>{dayMap[lbl]={val:data[i],full:fullLabels[i],isToday:i===6};});
  const sorted=monOrder.map((d,i)=>({day:d,full:fullMonOrder[i],val:dayMap[d]?dayMap[d].val:0,isToday:dayMap[d]?dayMap[d].isToday:false}));
  const total=sorted.reduce((s,d)=>s+d.val,0);
  let rows='';
  sorted.forEach((d,i)=>{
    const todayStyle=d.isToday?'background:#D0E4F5;font-weight:800':'';
    rows+=`<tr style="${todayStyle}"><td>${d.full}${d.isToday?' ★':''}</td><td>${d.val>0?'₹'+fmt(d.val):'—'}</td><td>${total>0?Math.round((d.val/total)*100)+'%':'—'}</td></tr>`;
  });
  const html=`
  <div class="summary-row">
    <div class="sum-box"><div class="sum-box-val">₹${fmt(total)}</div><div class="sum-box-lbl">Weekly Total</div></div>
    <div class="sum-box"><div class="sum-box-val" style="color:#00C48C">₹${fmt(total>0?Math.round(total/7):0)}</div><div class="sum-box-lbl">Daily Average</div></div>
    <div class="sum-box"><div class="sum-box-val" style="color:#F5A623">₹${fmt(collectedToday)}</div><div class="sum-box-lbl">Today</div></div>
  </div>
  <div class="section-title">Day-by-Day Breakdown (Mon – Sun)</div>
  <table><thead><tr><th>Day</th><th>Amount Collected</th><th>% of Week</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div style="font-size:10px;color:#3A6080;margin-top:6px">★ = Today · Week total: ₹${fmt(total)}</div>`;
  buildPDFWindow('Weekly Collection Report',html);
}

function exportMonthPDF(){
  const w1=Math.max(collectedToday,monthlyTotal>0?Math.round(monthlyTotal*0.28):0);
  const dailyAvg=w1>0?Math.round(w1/7):0;
  const weeks=[
    {label:'Week 1 (Days 1–7)',val:w1,actual:true},
    {label:'Week 2 (Days 8–14)',val:Math.round(dailyAvg*7*1.05),actual:false},
    {label:'Week 3 (Days 15–21)',val:Math.round(dailyAvg*7*0.98),actual:false},
    {label:'Week 4 (Days 22–31)',val:Math.round(dailyAvg*7*1.02),actual:false},
  ];
  const monthTotal=weeks.reduce((s,w)=>s+w.val,0);
  let wkRows=weeks.map(w=>`<tr><td>${w.label}</td><td><span class="${w.actual?'actual-label':'proj-label'}">${w.actual?'Actual':'Projected'}</span></td><td style="font-weight:800;font-size:13px">₹${fmt(w.val)}</td><td>${monthTotal>0?Math.round((w.val/monthTotal)*100)+'%':'—'}</td></tr>`).join('');

  // Mode breakdown
  const modeTotals={};
  feedItems.forEach(item=>{const m=item.mode||'Cash';if(!modeTotals[m])modeTotals[m]={a:0,c:0};modeTotals[m].a+=item.amount;modeTotals[m].c++;});
  const modeTotal=Object.values(modeTotals).reduce((s,v)=>s+v.a,0)||1;
  let modeRows=Object.entries(modeTotals).sort((a,b)=>b[1].a-a[1].a).map(([m,d])=>`<tr><td>${m}</td><td>${d.c} payment${d.c>1?'s':''}</td><td style="font-weight:800">₹${fmt(d.a)}</td><td>${Math.round((d.a/modeTotal)*100)}%</td></tr>`).join('');
  if(!modeRows)modeRows='<tr><td colspan="4" style="text-align:center;color:#7AAABF">No payment data yet</td></tr>';

  const html=`
  <div class="summary-row">
    <div class="sum-box"><div class="sum-box-val">₹${fmt(monthTotal)}</div><div class="sum-box-lbl">Month Projection</div></div>
    <div class="sum-box"><div class="sum-box-val" style="color:#00C48C">₹${fmt(w1)}</div><div class="sum-box-lbl">Week 1 Actual</div></div>
    <div class="sum-box"><div class="sum-box-val" style="color:#3A6080">₹${fmt(dailyAvg)}</div><div class="sum-box-lbl">Daily Average</div></div>
  </div>
  <div class="section-title">Week-by-Week Breakdown</div>
  <table><thead><tr><th>Period</th><th>Type</th><th>Amount</th><th>% of Month</th></tr></thead><tbody>${wkRows}</tbody></table>
  <div class="section-title">Collections by Payment Mode (Actual)</div>
  <table><thead><tr><th>Payment Mode</th><th>Count</th><th>Amount</th><th>Share %</th></tr></thead><tbody>${modeRows}</tbody></table>`;
  buildPDFWindow('Monthly Collection Report',html);
}

function openExportModal(){
  const choice=confirm('Export:\nOK = Today\'s Report\nCancel = Choose another…');
  if(choice)exportTodayPDF();
  else{const w=confirm('Export Weekly Report?\nOK = Week · Cancel = Month');if(w)exportWeekPDF();else exportMonthPDF();}
}

function exportLoanStatementPDF(){
  const b=curB;if(!b)return;
  const emi=getEMI(b);
  const tenure=b.tenure||0;
  const startDate=b.startDate?new Date(b.startDate):new Date();
  const freqDays={daily:1,weekly:7,monthly:30};
  const step=freqDays[b.freq]||1;
  const paidList=[...b.payments].reverse();
  const bal=Math.max(0,b.amount-b.paid);
  const pct=Math.round((b.paid/b.amount)*100);

  let rows='';
  for(let i=1;i<=tenure;i++){
    const dueDate=new Date(startDate);
    dueDate.setDate(dueDate.getDate()+(i-1)*step);
    const dueDateStr=fmtD(dueDate.toISOString().split('T')[0]);
    const payment=paidList[i-1]||null;
    const isPaid=!!payment;
    const today=new Date();today.setHours(0,0,0,0);
    const isOverdue=!isPaid&&dueDate<today;

    const paidStr=isPaid?`<span style="color:#065f46;font-weight:800">${payment.time||dueDateStr}</span>`:(isOverdue?'<span style="color:#dc2626;font-weight:700">Overdue</span>':'<span style="color:#aaa">—</span>');
    let modeStr='—';
    if(isPaid){
      const m=(payment.mode||'Cash').toLowerCase();
      const mc=m==='cash'?'background:#FFF3CD;color:#856404;border:1px solid #FFE69C':m==='upi'?'background:#EFF6FF;color:#1d4ed8;border:1px solid #BFDBFE':'background:#ECFDF5;color:#065f46;border:1px solid #6EE7B7';
      modeStr=`<span style="font-size:9px;font-weight:800;padding:2px 8px;border-radius:4px;${mc}">${(payment.mode||'CASH').toUpperCase()}</span>`;
    }
    const sigStr=isPaid?'<span style="font-size:14px">✓</span>':'<span style="display:inline-block;width:52px;height:22px;border:1px dashed #aaa;border-radius:3px;background:#FAFAFA"></span>';
    const rowBg=isPaid?'#F0FBF7':isOverdue?'#FEF2F2':'#fff';
    const isEven=i%2===0;
    const bg=isPaid?'#F0FBF7':isOverdue?'#FEF2F2':(isEven?'#F9FAFF':'#fff');

    rows+=`<tr style="background:${bg}">
      <td style="text-align:center;font-weight:700;color:#3A6080">${i}</td>
      <td>${dueDateStr}</td>
      <td>${paidStr}</td>
      <td style="text-align:center;font-weight:700">₹${fmt(emi)}</td>
      <td style="text-align:center">${modeStr}</td>
      <td style="text-align:center">${sigStr}</td>
    </tr>`;
  }

  const html=`
  <div style="display:flex;gap:16px;margin-bottom:16px">
    <div style="flex:1">
      <div style="font-size:11px;color:#3A6080;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Customer</div>
      <div style="font-size:16px;font-weight:800;color:#001A33">${b.name}</div>
      <div style="font-size:11px;color:#3A6080;margin-top:3px">📞 ${b.phone}</div>
      <div style="font-size:11px;color:#3A6080;margin-top:2px">📍 ${b.address}</div>
    </div>
    <div style="border:1.5px solid #A8C3DE;border-radius:10px;padding:10px 14px;min-width:130px;background:#E6EFF9">
      <div style="font-size:9px;font-weight:700;color:#3A6080;text-transform:uppercase;letter-spacing:.4px">Collection Type</div>
      <div style="font-size:14px;font-weight:800;color:#004C8F;margin-top:2px">${cap(b.freq||'Daily')}</div>
      <div style="font-size:9px;font-weight:700;color:#3A6080;text-transform:uppercase;letter-spacing:.4px;margin-top:8px">Start Date</div>
      <div style="font-size:13px;font-weight:700;color:#001A33;margin-top:2px">${fmtD(b.startDate)}</div>
    </div>
  </div>
  <div style="display:flex;gap:10px;margin-bottom:18px">
    <div style="flex:1;border:1.5px solid #A8C3DE;border-radius:8px;padding:9px 12px;background:#E6EFF9;text-align:center">
      <div style="font-size:16px;font-weight:800;color:#004C8F">₹${fmt(b.amount)}</div>
      <div style="font-size:9px;color:#3A6080;font-weight:600;margin-top:2px">LOAN AMOUNT</div>
    </div>
    <div style="flex:1;border:1.5px solid #A8C3DE;border-radius:8px;padding:9px 12px;background:#F0FBF7;text-align:center">
      <div style="font-size:16px;font-weight:800;color:#065f46">₹${fmt(b.paid)}</div>
      <div style="font-size:9px;color:#3A6080;font-weight:600;margin-top:2px">PAID</div>
    </div>
    <div style="flex:1;border:1.5px solid #A8C3DE;border-radius:8px;padding:9px 12px;background:#FEF2F2;text-align:center">
      <div style="font-size:16px;font-weight:800;color:#dc2626">₹${fmt(bal)}</div>
      <div style="font-size:9px;color:#3A6080;font-weight:600;margin-top:2px">BALANCE</div>
    </div>
    <div style="flex:1;border:1.5px solid #A8C3DE;border-radius:8px;padding:9px 12px;background:#E6EFF9;text-align:center">
      <div style="font-size:16px;font-weight:800;color:#004C8F">₹${fmt(emi)}</div>
      <div style="font-size:9px;color:#3A6080;font-weight:600;margin-top:2px">INSTALMENT</div>
    </div>
  </div>
  <div style="font-size:11px;font-weight:800;color:#001A33;text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;display:flex;align-items:center;gap:8px">
    <span style="width:8px;height:8px;border-radius:50%;background:#065f46;display:inline-block"></span>
    Installment Schedule
  </div>
  <table>
    <thead><tr style="background:#065f46">
      <th style="text-align:center;width:36px">NO</th>
      <th>DUE DATE</th>
      <th>PAID DATE</th>
      <th style="text-align:center">AMOUNT</th>
      <th style="text-align:center">MODE</th>
      <th style="text-align:center">SIGNATURE</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="margin-top:16px;font-size:10px;color:#3A6080">
    Recovery: <strong style="color:#004C8F">${pct}%</strong> · 
    Paid: <strong style="color:#065f46">₹${fmt(b.paid)}</strong> · 
    Balance: <strong style="color:#dc2626">₹${fmt(bal)}</strong> · 
    Instalments: <strong>${b.payments.length} of ${tenure}</strong>
  </div>`;

  buildPDFWindow('Loan Statement — '+b.name, html);
}
