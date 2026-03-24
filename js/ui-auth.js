/* ui-auth.js: Account Authentication — split from js/ui.js */

async function sha256(msg){
  const buf = new TextEncoder().encode(msg);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function togglePwVis(inputId, btn){
  const inp = document.getElementById(inputId);
  if(!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.querySelector('svg').innerHTML = show
    ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>'
    : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
}

async function doAuthLogin(){
  const user = (document.getElementById('auth-user').value||'').trim().toLowerCase();
  const pw   = (document.getElementById('auth-pw').value)||'';
  const errEl = document.getElementById('sp2-error');
  const showErr = msg => { errEl.textContent=msg; errEl.classList.add('vis'); };
  errEl.classList.remove('vis');

  if(!user||!pw){ showErr('Benutzername und Passwort eingeben'); return; }

  const adminUrlInput = (document.getElementById('auth-admin-url').value||'').trim();
  const adminUrl = adminUrlInput || CFG.adminUrl;
  if(!adminUrl){ showErr('Admin-Script-URL fehlt → ⚙ Admin-URL konfigurieren'); return; }

  const btn = document.getElementById('auth-login-btn');
  btn.classList.add('loading'); btn.disabled=true; btn.textContent='Anmelden…';
  try{
    const hash = await sha256(pw);
    let r, d;
    try {
      r = await fetch(adminUrl+'?'+new URLSearchParams({action:'login',user,hash}));
    } catch(netErr){ throw new Error('Netzwerkfehler – Server nicht erreichbar'); }
    if(!r.ok) throw new Error('Server-Fehler (HTTP '+r.status+')');
    try { d = await r.json(); } catch(e){ throw new Error('Ungültige Server-Antwort'); }
    if(d.error) throw new Error(d.error);
    CFG.adminUrl=adminUrl; CFG.sessionToken=d.token; CFG.authUser=d.username; CFG.authRole=d.role||'user';
    CFG.scriptUrl=''; CFG.demo=false;
    cfgSave();
    launchApp();
  }catch(e){
    showErr(e.message||'Verbindung fehlgeschlagen');
    btn.classList.remove('loading'); btn.disabled=false; btn.textContent='Anmelden →';
  }
}

async function doAuthSignup(){
  const user  = (document.getElementById('su-user').value||'').trim().toLowerCase();
  const pw    = (document.getElementById('su-pw').value)||'';
  const pw2   = (document.getElementById('su-pw2').value)||'';
  const adminUrl = (document.getElementById('su-admin-url').value||'').trim() || CFG.adminUrl;
  const errEl = document.getElementById('sp3-error');
  const showErr = msg => { errEl.textContent=msg; errEl.classList.add('vis'); };
  errEl.classList.remove('vis');

  if(!user||!pw||!pw2){ showErr('Alle Felder ausfüllen'); return; }
  if(pw!==pw2){ showErr('Passwörter stimmen nicht überein'); return; }
  if(pw.length<6){ showErr('Passwort: mind. 6 Zeichen'); return; }
  if(!adminUrl){ showErr('Admin-Script-URL eintragen'); return; }

  const btn = document.getElementById('auth-signup-btn');
  btn.classList.add('loading'); btn.disabled=true; btn.textContent='Konto wird erstellt…';
  try{
    const hash = await sha256(pw);
    let r, d;
    try {
      r = await fetch(adminUrl+'?'+new URLSearchParams({action:'signup',user,hash}));
    } catch(netErr){ throw new Error('Netzwerkfehler – Server nicht erreichbar'); }
    if(!r.ok) throw new Error('Server-Fehler (HTTP '+r.status+')');
    try { d = await r.json(); } catch(e){ throw new Error('Ungültige Server-Antwort'); }
    if(d.error) throw new Error(d.error);
    if(d.pending){
      CFG.adminUrl=adminUrl; cfgSave();
      showErr('Konto erstellt — warte auf Freischaltung durch den Admin.');
      btn.classList.remove('loading'); btn.disabled=false; btn.textContent='Konto erstellen →';
      return;
    }
    CFG.adminUrl=adminUrl; CFG.sessionToken=d.token; CFG.authUser=d.username; CFG.authRole=d.role||'user';
    CFG.scriptUrl=''; CFG.demo=false;
    cfgSave();
    toast('✓ Willkommen, '+d.username+'!','ok');
    launchApp();
  }catch(e){
    showErr(e.message||'Verbindung fehlgeschlagen');
    btn.classList.remove('loading'); btn.disabled=false; btn.textContent='Konto erstellen →';
  }
}

async function doChangePw(){
  const newPw = (document.getElementById('settings-new-pw').value||'').trim();
  if(newPw.length<6){ toast('Passwort: min. 6 Zeichen','err'); return; }
  if(!confirm('Passwort wirklich ändern?')) return;
  try{
    const newHash = await sha256(newPw);
    // Use admin_reset_pw on own account (admin) or a dedicated self-reset endpoint
    const r = await fetch(CFG.adminUrl+'?'+new URLSearchParams({action:'change_pw',token:CFG.sessionToken,newHash}));
    const d = await r.json();
    if(d.error) throw new Error(d.error);
    document.getElementById('settings-new-pw').value='';
    toast('✓ Passwort geändert','ok');
  }catch(e){ toast('Fehler: '+e.message,'err'); }
}

