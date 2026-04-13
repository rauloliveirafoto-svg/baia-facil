/* ============================================================
 * organizador.js — painel do organizador
 * ============================================================ */

function fmt(n)           { return String(n).padStart(3,'0'); }
function esc(s)           { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function statusLabel(s)   { return {available:'Disponível',reserved:'Reservada',blocked:'Bloqueada',maintenance:'Manutenção',selected:'Selecionada'}[s]||s; }

/* ── Tooltip customizado ─────────────────────────────────────── */
(function() {
  var tip = document.createElement('div');
  tip.id = 'baia-tooltip';
  tip.style.cssText = [
    'position:fixed',
    'z-index:9999',
    'pointer-events:none',
    'opacity:0',
    'transition:opacity .15s',
    'background:rgba(6,15,8,0.97)',
    'border:1px solid rgba(201,168,76,0.35)',
    'border-radius:10px',
    'padding:0',
    'box-shadow:0 8px 32px rgba(0,0,0,.55)',
    'min-width:180px',
    'max-width:240px',
    'font-family:"DM Sans",system-ui,sans-serif',
    'overflow:hidden',
  ].join(';');
  document.body.appendChild(tip);

  var COLORS = {
    available:   {bg:'rgba(77,170,106,.18)',  bd:'rgba(77,170,106,.5)',  text:'#4daa6a',  label:'Disponível'},
    reserved:    {bg:'rgba(220,80,80,.18)',   bd:'rgba(220,80,80,.5)',   text:'#e07070',  label:'Reservada'},
    blocked:     {bg:'rgba(232,160,48,.18)',  bd:'rgba(232,160,48,.5)',  text:'#e8a030',  label:'Bloqueada'},
    maintenance: {bg:'rgba(90,122,94,.18)',   bd:'rgba(90,122,94,.5)',   text:'#5a7a5e',  label:'Manutenção'},
    selected:    {bg:'rgba(201,168,76,.18)',  bd:'rgba(201,168,76,.5)',  text:'#c9a84c',  label:'Selecionada'},
  };

  function buildTip(data) {
    var c = COLORS[data.status] || COLORS.available;
    var rows = '';
    if (data.holderName)   rows += row('Titular',  esc(data.holderName));
    if (data.contactPhone) rows += row('Contato',  esc(data.contactPhone));
    if (data.requestedStalls && data.requestedStalls > 0)
                           rows += row('Qtd. baias', data.requestedStalls);
    if (data.reservedAt)   rows += row('Reservado', fmtDate(data.reservedAt));

    return '<div style="padding:.45rem .75rem;border-bottom:1px solid rgba(201,168,76,.15);display:flex;align-items:center;justify-content:space-between;gap:.5rem;">'
      + '<span style="font-size:.82rem;font-weight:700;color:#e8dfc8;letter-spacing:.04em;">Baia ' + fmt(data.number) + '</span>'
      + '<span style="font-size:.7rem;font-weight:600;padding:.15rem .5rem;border-radius:999px;background:'+c.bg+';border:1px solid '+c.bd+';color:'+c.text+';">' + c.label + '</span>'
      + '</div>'
      + (rows ? '<div style="padding:.45rem .75rem;display:grid;gap:.25rem;">' + rows + '</div>' : '');
  }

  function row(label, val) {
    return '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:.5rem;font-size:.78rem;">'
      + '<span style="color:rgba(201,168,76,.7);white-space:nowrap;">' + label + '</span>'
      + '<span style="color:#e8dfc8;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:130px;">' + val + '</span>'
      + '</div>';
  }

  function fmtDate(iso) {
    try { return new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
    catch(e) { return iso; }
  }

  var hideTimer;

  function showTip(el, data) {
    clearTimeout(hideTimer);
    tip.innerHTML = buildTip(data);
    tip.style.opacity = '1';
    positionTip(el);
  }

  function hideTip() {
    hideTimer = setTimeout(function() { tip.style.opacity = '0'; }, 80);
  }

  function positionTip(el) {
    var r  = el.getBoundingClientRect();
    var tw = 220;
    var left = r.left + r.width / 2 - tw / 2;
    var top  = r.top - 8;

    // evitar sair da viewport
    if (left < 8) left = 8;
    if (left + tw > window.innerWidth - 8) left = window.innerWidth - tw - 8;

    tip.style.width = tw + 'px';
    tip.style.left  = left + 'px';

    // medir altura após renderizar
    var th = tip.offsetHeight || 80;
    if (top - th < 8) {
      tip.style.top = (r.bottom + 8) + 'px'; // aparece abaixo
    } else {
      tip.style.top = (top - th) + 'px';     // aparece acima
    }
  }

  window.BAIA_TOOLTIP = { showTip: showTip, hideTip: hideTip };
})();

document.addEventListener('DOMContentLoaded', function() {
  if (document.body.dataset.page !== 'organizador') return;

  var $ = function(id) { return document.getElementById(id); };

  // ── Sessão ─────────────────────────────────────────────────
  var sess = window.BAIA_AUTH.getSession();
  var lblUser = $('sessionUserLabel');
  if (lblUser && sess) lblUser.textContent = sess.user || '';
  $('logoutBtn').addEventListener('click', function() {
    if (_unsub) _unsub();
    window.BAIA_AUTH.logout();
    window.location.replace('login.html');
  });

  // ── Elementos ──────────────────────────────────────────────
  var elTotal    = $('orgTotalStalls');
  var elReserv   = $('orgReservedCount');
  var elDisp     = $('orgAvailableCount');
  var elBloq     = $('orgBlockedCount');
  var elSel      = $('orgEventSelect');
  var elNoSel    = $('noSelectionHint');
  var elDetail   = $('stallDetailPanel');
  var elDetNum   = $('detailNumber');
  var elDetSt    = $('detailStatus');
  var elDetComp  = $('detailCompetitor');
  var elDetTel   = $('detailContact');
  var elFeed     = $('organizerFeedback');
  var elMove     = $('moveTargetInput');
  var elSearch   = $('searchCompetitor');
  var elFilter   = $('filterStatus');
  var elFindN    = $('findStall');
  var elTable    = $('reservationTableBody');
  var elMap      = $('organizerStallMap');
  var elTpl      = $('organizerStallTemplate');
  var elManModal = $('manualReservationModal');
  var elManMap   = $('manualStallMap');
  var elManTpl   = $('manualStallTemplate');
  var elManNome  = $('manualHolder');
  var elManTel   = $('manualPhone');
  var elManQtd   = $('manualQty');
  var elManPrev  = $('manualSelectedPreview');
  var elManFeed  = $('manualFeedback');

  // ── Fixar larguras da tabela via colgroup ──────────────────
  (function fixTableCols() {
    var table = elTable && elTable.closest('table');
    if (!table) return;
    var old = table.querySelector('colgroup');
    if (old) old.remove();
    var cg = document.createElement('colgroup');
    [44, 0, 34, 128, 26, 58].forEach(function(w) {
      var col = document.createElement('col');
      if (w) col.style.width = w + 'px';
      cg.appendChild(col);
    });
    table.style.tableLayout = 'fixed';
    table.style.width = '100%';
    table.insertBefore(cg, table.firstChild);
  })();

  // ── Estado ─────────────────────────────────────────────────
  var evId      = localStorage.getItem('baia_org_ev') || '1';
  var cache     = null;
  var selBaia   = null;
  var manSel    = [];
  var btnMap    = new Map();
  var manBtnMap = new Map();
  var pagina    = 1;
  var linhas    = [];
  var PAGE      = 10;
  var _unsub    = null;

  if (elSel) elSel.value = evId;

  // ── Init ───────────────────────────────────────────────────
  window.BAIA_MAP.buildStallMap({ mapElement:elMap, template:elTpl, onStallClick:clickBaia });
  elMap.querySelectorAll('.stall').forEach(function(b) { btnMap.set(Number(b.dataset.stallNumber),b); });
  iniciarListener();

  // ── Tooltip nos botões do mapa ─────────────────────────────
  elMap.addEventListener('mouseover', function(e) {
    var btn = e.target.closest('.stall');
    if (!btn || !cache) return;
    var n = Number(btn.dataset.stallNumber);
    var s = cache.stalls.find(function(x){return x.number===n;});
    if (!s) return;
    window.BAIA_TOOLTIP.showTip(btn, s);
  });
  elMap.addEventListener('mouseout', function(e) {
    if (!e.target.closest('.stall')) return;
    window.BAIA_TOOLTIP.hideTip();
  });
  elMap.addEventListener('mousemove', function(e) {
    var btn = e.target.closest('.stall');
    if (btn) window.BAIA_TOOLTIP.showTip(btn, (cache&&cache.stalls||[]).find(function(x){return x.number===Number(btn.dataset.stallNumber);})||{number:Number(btn.dataset.stallNumber),status:'available'});
  });

  // ── Seletor de evento ──────────────────────────────────────
  elSel.addEventListener('change', function() {
    evId = elSel.value;
    localStorage.setItem('baia_org_ev', evId);
    selBaia = null; cache = null;
    iniciarListener();
  });

  function iniciarListener() {
    if (_unsub) { _unsub(); _unsub = null; }
    _unsub = window.FB.escutar(evId, function(data) { cache = data; renderTudo(); });
  }

  // ── Filtros ────────────────────────────────────────────────
  elSearch.addEventListener('input',  function() { pagina=1; renderTabela(); });
  elFilter.addEventListener('change', function() { pagina=1; renderTabela(); });
  elFindN.addEventListener('input',   function() { pagina=1; renderTabela(); });

  // ── Botões de ação ─────────────────────────────────────────
  $('btnReleaseStall').addEventListener('click', function() {
    reqSel(function() { atualizarBaia(selBaia,{status:'available'}); msg('Baia liberada.'); });
  });
  $('btnBlockStall').addEventListener('click', function() {
    reqSel(function() {
      if (!confirm('Bloquear baia '+fmt(selBaia)+'?')) return;
      atualizarBaia(selBaia,{status:'blocked'}); msg('Baia bloqueada.');
    });
  });
  $('btnMaintenanceStall').addEventListener('click', function() {
    reqSel(function() {
      if (!confirm('Marcar baia '+fmt(selBaia)+' como manutenção?')) return;
      atualizarBaia(selBaia,{status:'maintenance'}); msg('Em manutenção.');
    });
  });
  $('btnRemoveReservation').addEventListener('click', function() {
    reqSel(function() {
      var s = cache && cache.stalls.find(function(x){return x.number===selBaia;});
      if (!s||s.status!=='reserved') { msg('Sem reserva ativa.',true); return; }
      if (!confirm('Remover reserva de '+(s.holderName||'?')+' na baia '+fmt(selBaia)+'?')) return;
      atualizarBaia(selBaia,{status:'available'}); msg('Reserva removida.');
    });
  });
  $('btnMoveReservation').addEventListener('click', function() {
    reqSel(function() {
      var dest = Number(elMove.value);
      if (!dest||dest<1||dest>100) { msg('Destino inválido.',true); return; }
      var ok = false;
      editarCache(function(next) {
        var src  = next.stalls.find(function(x){return x.number===selBaia;});
        var dst  = next.stalls.find(function(x){return x.number===dest;});
        if (!src||!dst||src.status!=='reserved'||dst.status!=='available') return;
        dst.status=src.status; dst.holderName=src.holderName;
        dst.contactPhone=src.contactPhone; dst.requestedStalls=src.requestedStalls;
        dst.reservedAt=new Date().toISOString();
        src.status='available'; src.holderName=''; src.contactPhone=''; src.requestedStalls=0; src.reservedAt='';
        ok=true;
      });
      if (!ok) { msg('Não foi possível mover.',true); return; }
      selBaia=dest; elMove.value=''; msg('Movida para baia '+fmt(dest)+'.');
    });
  });

  $('btnCreateReservation').addEventListener('click', abrirManual);
  $('closeManualModal').addEventListener('click', fecharManual);
  $('cancelManualReservation').addEventListener('click', fecharManual);
  elManModal.addEventListener('click', function(e) { if(e.target===elManModal) fecharManual(); });
  $('confirmManualReservation').addEventListener('click', confirmarManual);
  elManQtd.addEventListener('input', atualizarPrevManual);

  // Busca no mapa
  var elMapSearch    = $('orgMapSearch');
  var elMapSearchBtn = $('orgMapSearchBtn');
  if (elMapSearchBtn) {
    function buscarNoMapa() {
      var n = Number(elMapSearch.value);
      if (!n||n<1||n>100) return;
      var btn = elMap.querySelector('[data-stall-number="'+n+'"]');
      if (!btn) return;
      btn.scrollIntoView({behavior:'smooth',block:'center'});
      btn.classList.remove('stall--highlight'); void btn.offsetWidth;
      btn.classList.add('stall--highlight');
      setTimeout(function(){btn.classList.remove('stall--highlight');},3500);
    }
    elMapSearchBtn.addEventListener('click', buscarNoMapa);
    elMapSearch.addEventListener('keydown', function(e){if(e.key==='Enter')buscarNoMapa();});
  }

  $('exportCsv').addEventListener('click', exportCSV);
  $('printMap').addEventListener('click', function() { window.print(); });

  // ── Funções ────────────────────────────────────────────────
  function reqSel(cb) {
    if (!selBaia) { msg('Selecione uma baia no mapa.',true); return; }
    cb();
  }

  function msg(texto, erro) {
    elFeed.textContent = texto;
    elFeed.className = 'org-feedback' + (erro?' org-feedback--err':'');
    clearTimeout(elFeed._t);
    elFeed._t = setTimeout(function(){elFeed.textContent='';},5000);
  }

  function editarCache(fn) {
    if (!cache) return;
    try { fn(cache); } catch(e) { console.error('[org editarCache]', e); return; }
    cache.updatedAt = new Date().toISOString();
    window.FB.salvar(evId, cache);
  }

  function atualizarBaia(numero, valores) {
    editarCache(function(next) {
      var s = next.stalls.find(function(x){return x.number===numero;});
      if (!s) return;
      s.status          = valores.status          !== undefined ? valores.status          : s.status;
      s.holderName      = valores.holderName      !== undefined ? valores.holderName      : (valores.status!=='reserved'?'':s.holderName);
      s.contactPhone    = valores.contactPhone    !== undefined ? valores.contactPhone    : (valores.status!=='reserved'?'':s.contactPhone);
      s.requestedStalls = valores.requestedStalls !== undefined ? valores.requestedStalls : (valores.status!=='reserved'?0:s.requestedStalls);
      s.reservedAt      = valores.status==='reserved' ? (s.reservedAt||new Date().toISOString()) : '';
    });
    renderTudo();
  }

  function clickBaia(n) { selBaia=n; renderMapa(); renderDetalhe(); }

  function renderTudo() {
    if (!cache||!cache.stalls) return;
    elTotal.textContent  = String(cache.stalls.length);
    elReserv.textContent = String(cache.stalls.filter(function(s){return s.status==='reserved';}).length);
    elDisp.textContent   = String(cache.stalls.filter(function(s){return s.status==='available';}).length);
    elBloq.textContent   = String(cache.stalls.filter(function(s){return s.status==='blocked'||s.status==='maintenance';}).length);
    renderMapa(); renderDetalhe(); renderTabela();
  }

  function renderMapa() {
    if (!cache||!cache.stalls) return;
    cache.stalls.forEach(function(s) {
      var b = btnMap.get(s.number);
      if (!b) return;
      b.className='stall';
      if (s.status==='available')   b.classList.add('stall--org-available');
      if (s.status==='reserved')    b.classList.add('stall--org-reserved');
      if (s.status==='blocked')     b.classList.add('stall--org-blocked');
      if (s.status==='maintenance') b.classList.add('stall--org-maintenance');
      if (s.number===selBaia)       b.classList.add('stall--selected');
      b.removeAttribute('title');
    });
  }

  function renderDetalhe() {
    if (!selBaia) { elNoSel.hidden=false; elDetail.hidden=true; return; }
    var s = cache && cache.stalls.find(function(x){return x.number===selBaia;});
    if (!s) return;
    elNoSel.hidden=true; elDetail.hidden=false;
    elDetNum.textContent  = fmt(s.number);
    elDetSt.textContent   = statusLabel(s.status);
    elDetComp.textContent = s.holderName  || '—';
    elDetTel.textContent  = s.contactPhone|| '—';
  }

  function renderTabela() {
    if (!cache||!cache.stalls) return;
    var busca  = elSearch.value.trim().toLowerCase();
    var status = elFilter.value;
    var numBusca = Number(elFindN.value);
    linhas = cache.stalls.filter(function(s) {
      var okNome   = busca   ? (s.holderName||'').toLowerCase().includes(busca) : true;
      var okStatus = status==='all' ? true : s.status===status;
      var okNum    = numBusca ? s.number===numBusca : true;
      return okNome && okStatus && okNum;
    }).sort(function(a,b){return a.number-b.number;});
    renderPagina();
  }

  var statusColors = {available:'#4daa6a',reserved:'#e07070',blocked:'#e8a030',maintenance:'#5a7a5e',selected:'#c9a84c'};

  function renderPagina() {
    elTable.innerHTML='';
    if (!linhas.length) {
      elTable.innerHTML='<tr class="empty-row"><td colspan="6">Nenhuma baia encontrada.</td></tr>';
      removerMaisBtn(); return;
    }
    linhas.slice(0, pagina*PAGE).forEach(function(s) {
      var dotColor = statusColors[s.status] || '#7a9e7e';
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><strong>'+fmt(s.number)+'</strong></td>'+
        '<td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+(s.holderName?esc(s.holderName):'')+'">'+
          (s.holderName ? esc(s.holderName) : '<span style="color:var(--muted)">—</span>')+
        '</td>'+
        '<td>'+(s.requestedStalls||'<span style="color:var(--muted)">—</span>')+'</td>'+
        '<td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+
          (s.contactPhone ? esc(s.contactPhone) : '<span style="color:var(--muted)">—</span>')+
        '</td>'+
        '<td style="text-align:center;" title="'+statusLabel(s.status)+'">'+
          '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:'+dotColor+';"></span>'+
        '</td>'+
        '<td><button class="btn" data-n="'+s.number+'" type="button" style="padding:.3rem .5rem;font-size:.78rem;width:100%;">Abrir</button></td>';
      elTable.appendChild(tr);
    });
    elTable.querySelectorAll('[data-n]').forEach(function(b) {
      b.addEventListener('click', function() {
        selBaia = Number(b.dataset.n);
        renderMapa(); renderDetalhe();
        window.scrollTo({top:0,behavior:'smooth'});
        setTimeout(function(){
          var sb = elMap.querySelector('[data-stall-number="'+selBaia+'"]');
          if (!sb) return;
          sb.scrollIntoView({behavior:'smooth',block:'center'});
          sb.classList.remove('stall--highlight'); void sb.offsetWidth;
          sb.classList.add('stall--highlight');
          setTimeout(function(){sb.classList.remove('stall--highlight');},3000);
        },350);
      });
    });
    var total = linhas.length, vis = Math.min(pagina*PAGE, total);
    var btn = document.getElementById('maisLinhasBtn');
    if (vis >= total) { if(btn) btn.remove(); return; }
    if (!btn) {
      btn = document.createElement('button');
      btn.id='maisLinhasBtn'; btn.className='btn'; btn.type='button';
      btn.style.cssText='width:100%;margin-top:.5rem;font-size:.84rem;';
      btn.addEventListener('click', function(){pagina++;renderPagina();});
      elTable.closest('.table-wrap').after(btn);
    }
    btn.textContent = 'Mostrar mais — '+vis+' de '+total+' baias';
  }

  function removerMaisBtn() { var b=document.getElementById('maisLinhasBtn'); if(b) b.remove(); }

  // ── Modal reserva manual ───────────────────────────────────
  function abrirManual() {
    manSel=[];
    elManNome.value=''; elManTel.value=''; elManQtd.value='';
    elManFeed.textContent='';
    atualizarPrevManual();
    elManMap.innerHTML=''; manBtnMap=new Map();
    window.BAIA_MAP.buildStallMap({mapElement:elManMap,template:elManTpl,onStallClick:clickManual});
    elManMap.querySelectorAll('.stall').forEach(function(b){manBtnMap.set(Number(b.dataset.stallNumber),b);});
    renderMapaManual();
    elManModal.hidden=false; document.body.style.overflow='hidden';
  }

  function fecharManual() { elManModal.hidden=true; document.body.style.overflow=''; manSel=[]; }

  function clickManual(n) {
    if (!cache) return;
    var s = cache.stalls.find(function(x){return x.number===n;});
    if (!s||s.status!=='available') { elManFeed.textContent='Baia não disponível.'; return; }
    elManFeed.textContent='';
    var idx = manSel.indexOf(n);
    if (idx>=0) { manSel.splice(idx,1); }
    else {
      var qtd = Number(elManQtd.value)||0;
      if (qtd>0&&manSel.length>=qtd) { elManFeed.textContent='Limite de '+qtd+' baia(s).'; return; }
      manSel.push(n);
    }
    renderMapaManual(); atualizarPrevManual();
  }

  function renderMapaManual() {
    if (!cache) return;
    cache.stalls.forEach(function(s) {
      var b=manBtnMap.get(s.number);
      if (!b) return;
      b.className='stall'; b.disabled=false;
      if (manSel.indexOf(s.number)>=0)   b.classList.add('stall--selected');
      else if (s.status==='reserved')    { b.classList.add('stall--org-reserved'); b.disabled=true; }
      else if (s.status!=='available')   { b.classList.add('stall--blocked'); b.disabled=true; }
    });
  }

  function atualizarPrevManual() {
    elManPrev.textContent = manSel.length===0 ? 'Nenhuma baia selecionada' : 'Selecionadas: '+manSel.map(fmt).join(', ');
  }

  function confirmarManual() {
    var nome = elManNome.value.trim();
    var tel  = elManTel.value.trim();
    var qtd  = Number(elManQtd.value);
    function err(m){elManFeed.textContent=m;elManFeed.className='org-feedback org-feedback--err';}
    if (!nome)             return err('Informe o titular.');
    if (!tel)              return err('Informe o telefone.');
    if (!qtd||qtd<1)       return err('Informe a quantidade.');
    if (!manSel.length)    return err('Selecione ao menos uma baia.');
    if (manSel.length!==qtd) return err('Selecione exatamente '+qtd+' baia(s). Atual: '+manSel.length+'.');
    editarCache(function(next) {
      manSel.forEach(function(n) {
        var s=next.stalls.find(function(x){return x.number===n;});
        if (!s) return;
        s.status='reserved'; s.holderName=nome; s.contactPhone=tel;
        s.requestedStalls=qtd; s.reservedAt=new Date().toISOString();
      });
    });
    fecharManual(); renderTudo();
    msg('Reserva criada: '+manSel.map(fmt).join(', ')+' → '+nome+'.');
  }

  function exportCSV() {
    if (!cache) return;
    var rows=[['Baia','Status','Titular','Telefone','Qtd','Reservado em']];
    cache.stalls.forEach(function(s){
      rows.push([fmt(s.number),statusLabel(s.status),s.holderName||'',s.contactPhone||'',
        s.requestedStalls||'', s.reservedAt?new Date(s.reservedAt).toLocaleString('pt-BR'):'']);
    });
    var csv = rows.map(function(r){return r.map(function(v){return'"'+String(v).replace(/"/g,'""')+'"';}).join(',');}).join('\n');
    var blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
    var url  = URL.createObjectURL(blob);
    var a    = Object.assign(document.createElement('a'),{href:url,download:'reservas.csv'});
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    msg('CSV exportado!');
  }
});
