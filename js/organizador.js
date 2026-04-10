/* ============================================================
 * organizador.js — painel do organizador
 * ============================================================ */

function fmt(n)           { return String(n).padStart(3,'0'); }
function esc(s)           { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function statusLabel(s)   { return {available:'Disponível',reserved:'Reservada',blocked:'Bloqueada',maintenance:'Manutenção',selected:'Selecionada'}[s]||s; }

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
  var elObsInput = $('stallObsInput');
  var elSaveObs  = $('btnSaveObs');
  var elLogList  = $('logList');
  var elClearLog      = $('btnClearLog');
  var tooltip         = $('stallTooltip');
  var elNameSearch    = $('nameSearchInput');
  var confirmModal    = $('confirmModal');
  var confirmBox      = $('confirmBox');
  var confirmTitle    = $('confirmTitle');
  var confirmMsg      = $('confirmMsg');
  var confirmOk       = $('confirmOk');
  var confirmCancel   = $('confirmCancel');
  var connDot         = $('connDot');
  var connLabel       = $('connLabel');
  var _confirmCb      = null; // callback pendente da confirmação
  var elNameSearchBtn = $('nameSearchBtn');
  var elNameClear     = $('nameSearchClear');
  var occReserved     = $('occBarReserved');
  var occBlocked      = $('occBarBlocked');
  var occAvail        = $('occBarAvail');
  var occPctReserved  = $('occPctReserved');
  var occPctBlocked   = $('occPctBlocked');
  var occPctAvail     = $('occPctAvail');
  var _nameHighlight  = [];   // baias atualmente destacadas pela busca de nome

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
  var logEntries = [];        // histórico de ações em memória
  var sessUser   = (window.BAIA_AUTH && window.BAIA_AUTH.getSession()) ? window.BAIA_AUTH.getSession().user : 'org';

  if (elSel) elSel.value = evId;

  // ── Init ───────────────────────────────────────────────────
  window.BAIA_MAP.buildStallMap({ mapElement:elMap, template:elTpl, onStallClick:clickBaia });
  elMap.querySelectorAll('.stall').forEach(function(b) { btnMap.set(Number(b.dataset.stallNumber),b); });
  iniciarListener();

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
    carregarAcessos();
    carregarHistorico(); // carregar histórico persistido do Firestore
  }

  // ── Filtros ────────────────────────────────────────────────
  elSearch.addEventListener('input',  function() { pagina=1; renderTabela(); });
  elFilter.addEventListener('change', function() { pagina=1; renderTabela(); });
  elFindN.addEventListener('input',   function() { pagina=1; renderTabela(); });

  // ── Botões de ação ─────────────────────────────────────────
  $('btnReleaseStall').addEventListener('click', function() {
    reqSel(function() { atualizarBaia(selBaia,{status:'available'}); addLog('Liberada', selBaia); msg('Baia liberada.'); });
  });
  $('btnBlockStall').addEventListener('click', function() {
    reqSel(function() {
      confirmar('Bloquear baia', 'Bloquear a baia '+fmt(selBaia)+'? Ela ficará indisponível para reserva.', function() {
        atualizarBaia(selBaia,{status:'blocked'}); addLog('Bloqueada', selBaia); msg('Baia bloqueada.');
      }, 'warn');
    });
  });
  $('btnMaintenanceStall').addEventListener('click', function() {
    reqSel(function() {
      confirmar('Manutenção', 'Marcar a baia '+fmt(selBaia)+' como em manutenção?', function() {
        atualizarBaia(selBaia,{status:'maintenance'}); addLog('Manutenção', selBaia); msg('Em manutenção.');
      }, 'warn');
    });
  });
  $('btnRemoveReservation').addEventListener('click', function() {
    reqSel(function() {
      var s = cache && cache.stalls.find(function(x){return x.number===selBaia;});
      if (!s||s.status!=='reserved') { msg('Sem reserva ativa.',true); return; }
      confirmar(
        'Remover reserva',
        'Remover a reserva de '+(s.holderName||'?')+' na baia '+fmt(selBaia)+'? Esta ação não pode ser desfeita.',
        function() { atualizarBaia(selBaia,{status:'available'}); addLog('Reserva removida', selBaia); msg('Reserva removida.'); }
      );
    });
  });
  $('btnMoveReservation').addEventListener('click', function() {
    reqSel(function() {
      var dest = Number(elMove.value);
      var totalBaias = (window.BAIA_CONFIG && window.BAIA_CONFIG.TOTAL_STALLS) || 140;
      if (!dest||dest<1||dest>totalBaias) { msg('Destino inválido.',true); return; }
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
      addLog('Movida', selBaia, 'para '+fmt(dest)); selBaia=dest; elMove.value=''; msg('Movida para baia '+fmt(dest)+'.');
    });
  });

  $('btnCreateReservation').addEventListener('click', abrirManual);
  $('closeManualModal').addEventListener('click', fecharManual);
  $('cancelManualReservation').addEventListener('click', fecharManual);
  elManModal.addEventListener('click', function(e) { if(e.target===elManModal) fecharManual(); });
  $('confirmManualReservation').addEventListener('click', confirmarManual);

  // CORREÇÃO: ao mudar a quantidade na reserva manual, revalidar baias já selecionadas
  // e remover o excesso caso a nova quantidade seja menor que a seleção atual
  elManQtd.addEventListener('input', function() {
    var novaQtd = Number(elManQtd.value) || 0;
    if (novaQtd > 0 && manSel.length > novaQtd) {
      // Remover baias excedentes (mantém as primeiras selecionadas)
      manSel = manSel.slice(0, novaQtd);
      renderMapaManual();
    }
    atualizarPrevManual();
  });

  // Busca no mapa
  var elMapSearch    = $('orgMapSearch');
  var elMapSearchBtn = $('orgMapSearchBtn');
  if (elMapSearchBtn) {
    function buscarNoMapa() {
      var n = Number(elMapSearch.value);
      var totalBaias = (window.BAIA_CONFIG && window.BAIA_CONFIG.TOTAL_STALLS) || 140;
      if (!n||n<1||n>totalBaias) return;
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

  // Encerrar prova
  if ($('btnEncerrarProva')) {
    $('btnEncerrarProva').addEventListener('click', function() {
      if (!cache) return;
      var evNome = elSel.options[elSel.selectedIndex] ? elSel.options[elSel.selectedIndex].text : 'Evento';
      confirmar(
        'Encerrar prova',
        'Encerrar "' + evNome + '"? Esta ação é irreversível. Um relatório PDF será gerado automaticamente.',
        function() { executarEncerramento(evNome); }
      );
    });
  }

  // W: carregar log de acessos ao trocar de evento
  carregarAcessos();

  // Salvar observação
  if (elSaveObs) {
    elSaveObs.addEventListener('click', function() {
      if (!selBaia) return;
      var obs = elObsInput ? elObsInput.value.trim() : '';
      editarCache(function(next) {
        var s = next.stalls.find(function(x){ return x.number === selBaia; });
        if (s) s.obs = obs;
      });
      addLog('Observação', selBaia, obs ? '"' + obs + '"' : '(removida)');
      msg('Observação salva.');
    });
  }

  // Limpar histórico
  if (elClearLog) {
    elClearLog.addEventListener('click', function() {
      logEntries = [];
      renderLog();
    });
  }

  // ── F: busca por nome no mapa ─────────────────────────────────
  function aplicarNomeBusca(nome) {
    // Limpar highlight anterior
    _nameHighlight.forEach(function(n) {
      var b = btnMap.get(n);
      if (b) { b.classList.remove('stall--name-match'); b.classList.remove('stall--name-dim'); }
    });
    _nameHighlight = [];

    if (!nome || !cache) return;

    var termo = nome.trim().toLowerCase();
    var matches = [];

    cache.stalls.forEach(function(s) {
      var b = btnMap.get(s.number);
      if (!b) return;
      var nomeStall = (s.holderName || '').toLowerCase();
      if (nomeStall.includes(termo) && s.status === 'reserved') {
        matches.push(s.number);
      }
    });

    if (!matches.length) return;

    // Destacar matches, escurecer o resto
    cache.stalls.forEach(function(s) {
      var b = btnMap.get(s.number);
      if (!b) return;
      if (matches.indexOf(s.number) >= 0) {
        b.classList.add('stall--name-match');
      } else {
        b.classList.add('stall--name-dim');
      }
    });

    _nameHighlight = cache.stalls.map(function(s){ return s.number; });

    // Scroll para primeira baia encontrada
    var primeiro = elMap.querySelector('[data-stall-number="' + matches[0] + '"]');
    if (primeiro) primeiro.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function limparNomeBusca() {
    _nameHighlight.forEach(function(n) {
      var b = btnMap.get(n);
      if (b) { b.classList.remove('stall--name-match'); b.classList.remove('stall--name-dim'); }
    });
    _nameHighlight = [];
    if (elNameSearch) elNameSearch.value = '';
  }

  if (elNameSearchBtn) {
    elNameSearchBtn.addEventListener('click', function() {
      aplicarNomeBusca(elNameSearch ? elNameSearch.value : '');
    });
  }
  if (elNameSearch) {
    elNameSearch.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') aplicarNomeBusca(elNameSearch.value);
      if (e.key === 'Escape') limparNomeBusca();
    });
    // Limpar ao apagar tudo
    elNameSearch.addEventListener('input', function() {
      if (!elNameSearch.value) limparNomeBusca();
    });
  }
  if (elNameClear) {
    elNameClear.addEventListener('click', limparNomeBusca);
  }

  // Tooltip no hover das baias
  if (tooltip) {
    elMap.addEventListener('mouseover', function(e) {
      var btn = e.target.closest('.stall');
      if (!btn || !cache) return;
      var n = Number(btn.dataset.stallNumber);
      var s = cache.stalls.find(function(x){ return x.number === n; });
      if (!s) return;
      $('tooltipNum').textContent    = 'Baia ' + fmt(n);
      $('tooltipStatus').innerHTML   = '<span>Status</span> ' + statusLabel(s.status);
      $('tooltipHolder').innerHTML   = s.holderName   ? '<span>Titular</span> ' + esc(s.holderName)   : '';
      $('tooltipPhone').innerHTML    = s.contactPhone ? '<span>Contato</span> ' + esc(s.contactPhone) : '';
      var obsEl = $('tooltipObs');
      if (s.obs) { obsEl.textContent = s.obs; obsEl.hidden = false; }
      else       { obsEl.hidden = true; }
      tooltip.classList.add('visible');
    });
    elMap.addEventListener('mousemove', function(e) {
      if (!tooltip.classList.contains('visible')) return;
      var x = e.clientX + 14, y = e.clientY + 14;
      if (x + 250 > window.innerWidth)  x = e.clientX - 254;
      if (y + 160 > window.innerHeight) y = e.clientY - 164;
      tooltip.style.left = x + 'px';
      tooltip.style.top  = y + 'px';
    });
    elMap.addEventListener('mouseleave', function() {
      tooltip.classList.remove('visible');
    });
  }

  // CORREÇÃO: botão "Exportar PDF" existia no HTML mas sem listener — implementado aqui
  $('exportPdf').addEventListener('click', exportPDF);

  $('printMap').addEventListener('click', function() { window.print(); });

  // ── Funções ────────────────────────────────────────────────
  // ── J: Modal de confirmação ─────────────────────────────────
  function confirmar(titulo, mensagem, cb, tipo) {
    // tipo: 'danger' (default) ou 'warn'
    confirmTitle.textContent = titulo;
    confirmMsg.textContent   = mensagem;
    confirmBox.className     = 'confirm-modal__box' + (tipo === 'warn' ? ' confirm--warn' : '');
    confirmOk.className      = 'confirm-modal__ok'  + (tipo === 'warn' ? ' confirm--warn-btn' : '');
    _confirmCb = cb;
    confirmModal.hidden = false;
  }

  if (confirmOk) {
    confirmOk.addEventListener('click', function() {
      confirmModal.hidden = true;
      if (_confirmCb) { var cb = _confirmCb; _confirmCb = null; cb(); }
    });
  }
  if (confirmCancel) {
    confirmCancel.addEventListener('click', function() {
      confirmModal.hidden = true; _confirmCb = null;
    });
  }
  if (confirmModal) {
    confirmModal.addEventListener('click', function(e) {
      if (e.target === confirmModal) { confirmModal.hidden = true; _confirmCb = null; }
    });
  }

  // ── L: Indicador de conexão ──────────────────────────────────
  function setConn(estado) {
    // estado: 'online' | 'offline' | 'syncing'
    if (!connDot || !connLabel) return;
    connDot.className = 'conn-dot' + (estado !== 'online' ? ' ' + estado : '');
    connLabel.textContent = estado === 'online' ? 'online' : estado === 'syncing' ? 'sincronizando' : 'offline';
  }

  // Detectar conexão via navigator.onLine + eventos
  window.addEventListener('online',  function() { setConn('online');  });
  window.addEventListener('offline', function() { setConn('offline'); });
  setConn(navigator.onLine ? 'online' : 'offline');

  // ── Histórico de ações (Firestore + local) ──────────────────
  function addLog(acao, numero, extra) {
    var now = new Date();
    var entrada = {
      time:   now.toLocaleTimeString('pt-BR'),
      acao:   acao,
      numero: numero ? fmt(numero) : null,
      extra:  extra || '',
      user:   sessUser,
    };
    // Adicionar no topo da lista local para UX imediato
    logEntries.unshift(entrada);
    if (logEntries.length > 200) logEntries.pop();
    renderLog();
    // Persistir no Firestore — não bloqueia UI
    if (window.FB && window.FB.registrarAcao) {
      window.FB.registrarAcao(evId, acao, numero, extra, sessUser);
    }
  }

  function renderLog() {
    if (!elLogList) return;
    if (!logEntries.length) {
      elLogList.innerHTML = '<p class="log-empty">Nenhuma ação registrada.</p>';
      return;
    }
    elLogList.innerHTML = logEntries.map(function(e) {
      return '<div class="log-item">' +
        '<div class="log-item__time">' + e.time + ' · ' + esc(e.user||'org') + '</div>' +
        '<span class="log-item__action">' + esc(e.acao) + '</span>' +
        (e.numero ? ' — Baia ' + e.numero : '') +
        (e.extra  ? ' · ' + esc(e.extra)  : '') +
        '</div>';
    }).join('');
  }

  // Carregar histórico do Firestore ao trocar de prova
  function carregarHistorico() {
    if (!window.FB || !window.FB.getHistorico) return;
    window.FB.getHistorico(evId).then(function(acoes) {
      logEntries = acoes.map(function(a) {
        return {
          time:   a.at ? new Date(a.at).toLocaleTimeString('pt-BR') : '—',
          acao:   a.acao || '',
          numero: a.baia ? fmt(a.baia) : null,
          extra:  a.extra || '',
          user:   a.usuario || 'org',
        };
      });
      renderLog();
    }).catch(function(){});
  }

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
    setConn('syncing');
    window.FB.salvar(evId, cache).then(function() {
      setConn('online');
    }).catch(function() {
      setConn('offline');
    });
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
      // Preservar obs ao mudar status — só limpa se explicitamente passado
      if (valores.obs !== undefined) s.obs = valores.obs;
    });
    renderTudo();
  }

  function clickBaia(n) { selBaia=n; renderMapa(); renderDetalhe(); }

  function renderTudo() {
    if (!cache||!cache.stalls) return;
    var total    = cache.stalls.length;
    var reserved = cache.stalls.filter(function(s){return s.status==='reserved';}).length;
    var avail    = cache.stalls.filter(function(s){return s.status==='available';}).length;
    var bloq     = cache.stalls.filter(function(s){return s.status==='blocked'||s.status==='maintenance';}).length;

    elTotal.textContent  = String(total);
    elReserv.textContent = String(reserved);
    elDisp.textContent   = String(avail);
    elBloq.textContent   = String(bloq);

    // RISCO 1: desativar botão de encerramento se prova já encerrada
    var btnEnc = $('btnEncerrarProva');
    if (btnEnc) {
      if (cache.status === 'encerrada') {
        btnEnc.disabled = true;
        btnEnc.textContent = '✓ Prova encerrada';
        btnEnc.style.opacity = '0.5';
      } else {
        btnEnc.disabled = false;
        btnEnc.textContent = '⏹ Encerrar prova';
        btnEnc.style.opacity = '';
      }
    }

    // ── E: atualizar barra de ocupação ─────────────────────────
    if (occReserved && total > 0) {
      var pR = Math.round(reserved / total * 100);
      var pB = Math.round(bloq     / total * 100);
      var pA = 100 - pR - pB;
      occReserved.style.width = pR + '%';
      occBlocked.style.width  = pB + '%';
      occAvail.style.width    = Math.max(0, pA) + '%';
      if (occPctReserved) occPctReserved.textContent = pR + '%';
      if (occPctBlocked)  occPctBlocked.textContent  = pB + '%';
      if (occPctAvail)    occPctAvail.textContent     = Math.max(0, pA) + '%';
    }

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
      b.title = fmt(s.number)+' | '+statusLabel(s.status)+' | '+(s.holderName||'—');
    });
    // Re-aplicar highlight de busca por nome após cada renderMapa
    // Proteção contra recursão: aplicarNomeBusca não chama renderMapa
    if (elNameSearch && elNameSearch.value.trim()) {
      var termo = elNameSearch.value.trim().toLowerCase();
      // Re-aplicar classes diretamente sem chamar aplicarNomeBusca (evita loop)
      var matches = [];
      cache.stalls.forEach(function(s) {
        if ((s.holderName||'').toLowerCase().includes(termo) && s.status==='reserved') {
          matches.push(s.number);
        }
      });
      if (matches.length > 0) {
        cache.stalls.forEach(function(s) {
          var b = btnMap.get(s.number);
          if (!b) return;
          if (matches.indexOf(s.number) >= 0) b.classList.add('stall--name-match');
          else b.classList.add('stall--name-dim');
        });
        _nameHighlight = cache.stalls.map(function(s){ return s.number; });
      }
    }
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
    // Preencher campo de observação com valor salvo
    if (elObsInput) elObsInput.value = s.obs || '';
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
    // CORREÇÃO: resetar para página 1 ao mudar filtro para garantir que o botão
    // "Mostrar mais" seja removido corretamente antes de renderizar a nova listagem
    pagina = 1;
    renderPagina();
  }

  function renderPagina() {
    elTable.innerHTML='';
    // CORREÇÃO: sempre remover o botão órfão antes de decidir se deve recriar
    removerMaisBtn();

    if (!linhas.length) {
      elTable.innerHTML='<tr class="empty-row"><td colspan="6">Nenhuma baia encontrada.</td></tr>';
      return;
    }
    linhas.slice(0, pagina*PAGE).forEach(function(s) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><strong>'+fmt(s.number)+'</strong></td>'+
        '<td>'+(s.holderName?esc(s.holderName):'<span style="color:var(--muted)">—</span>')+'</td>'+
        '<td>'+(s.requestedStalls||'<span style="color:var(--muted)">—</span>')+'</td>'+
        '<td>'+(s.contactPhone?esc(s.contactPhone):'<span style="color:var(--muted)">—</span>')+'</td>'+
        '<td><span class="status-chip status-chip--'+s.status+'">'+statusLabel(s.status)+'</span></td>'+
        '<td><button class="btn" data-n="'+s.number+'" type="button" style="padding:.3rem .6rem;font-size:.78rem;">Abrir</button></td>';
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
    if (vis >= total) return;

    var btn = document.createElement('button');
    btn.id='maisLinhasBtn'; btn.className='btn'; btn.type='button';
    btn.style.cssText='width:100%;margin-top:.5rem;font-size:.84rem;';
    btn.textContent = 'Mostrar mais — '+vis+' de '+total+' baias';
    btn.addEventListener('click', function(){ pagina++; renderPagina(); });
    elTable.closest('.table-wrap').after(btn);
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
    addLog('Reserva manual', null, manSel.map(fmt).join(', ')+' → '+nome); msg('Reserva criada: '+manSel.map(fmt).join(', ')+' → '+nome+'.');
  }

  // ── Encerramento da prova ────────────────────────────────────
  async function executarEncerramento(evNome) {
    if (!cache) return;
    var btnEnc = $('btnEncerrarProva');
    if (btnEnc) { btnEnc.disabled = true; btnEnc.textContent = 'Encerrando...'; }

    try {
      // 1. Marcar como encerrada no Firestore
      await window.FB.encerrarProva(evId, sessUser);

      // 2. Buscar estado final do Firestore para garantir PDF atualizado
      var snapFinal = await window.FB.getProvaSnapshot(evId);
      var dadosFinal = snapFinal || cache; // fallback para cache se necessário
      var historico = await window.FB.getHistorico(evId);
      await gerarRelatorioPDF(dadosFinal, evNome, historico);

      msg('Prova encerrada. Relatório gerado.');
      addLog('Prova encerrada', null, evNome);

      // 3. Atualizar UI — badge de encerrada
      if (btnEnc) { btnEnc.textContent = '✓ Encerrada'; btnEnc.disabled = true; }

    } catch(e) {
      console.error('[encerramento]', e);
      msg('Erro ao encerrar. Tente novamente.', true);
      if (btnEnc) { btnEnc.disabled = false; btnEnc.textContent = '⏹ Encerrar prova'; }
    }
  }

  async function gerarRelatorioPDF(dados, evNome, historico) {
    if (typeof window.jspdf === 'undefined') {
      await new Promise(function(resolve, reject) {
        var script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.onload = resolve; script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    var jsPDF = window.jspdf.jsPDF;
    var doc   = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    var W = 210; var M = 14; var y = 0;

    var stalls  = dados.stalls || [];
    var total   = stalls.length;
    var reserv  = stalls.filter(function(s){ return s.status==='reserved'; });
    var bloq    = stalls.filter(function(s){ return s.status==='blocked'||s.status==='maintenance'; });
    var disp    = stalls.filter(function(s){ return s.status==='available'; });
    var pct     = total > 0 ? Math.round(reserv.length/total*100) : 0;
    var now     = new Date();

    // helpers
    function novaPaginaSe(limite) {
      if (y > limite) { doc.addPage(); y = 20; }
    }
    function secao(titulo) {
      novaPaginaSe(260);
      doc.setFillColor(6,15,8);
      doc.rect(M, y, W-M*2, 8, 'F');
      doc.setTextColor(201,168,76); doc.setFontSize(8); doc.setFont('helvetica','bold');
      doc.text(titulo, M+3, y+5.5);
      y += 11;
    }
    function linha(txt, cor, tam) {
      novaPaginaSe(275);
      doc.setTextColor.apply(doc, cor||[40,40,40]);
      doc.setFontSize(tam||8); doc.setFont('helvetica','normal');
      doc.text(txt, M+3, y);
      y += 5.5;
    }
    function wrap(txt, maxLen) {
      // Quebra por espaços primeiro; se palavra > maxLen, força quebra por caractere
      var words = txt.split(' '); var line = ''; var lines = [];
      words.forEach(function(w) {
        // Palavra maior que maxLen — forçar quebra interna
        while (w.length > maxLen) {
          if (line) { lines.push(line.trim()); line = ''; }
          lines.push(w.slice(0, maxLen));
          w = w.slice(maxLen);
        }
        if ((line + w).length > maxLen) { if (line) lines.push(line.trim()); line = w + ' '; }
        else line += w + ' ';
      });
      if (line.trim()) lines.push(line.trim());
      return lines.length ? lines : [txt.slice(0, maxLen)];
    }

    // ── Cabeçalho ────────────────────────────────────────────────
    doc.setFillColor(6,15,8);
    doc.rect(0, 0, W, 40, 'F');
    doc.setTextColor(201,168,76);
    doc.setFontSize(20); doc.setFont('helvetica','bold');
    doc.text('BAIA FÁCIL', M, 14);
    doc.setFontSize(8); doc.setTextColor(160,160,160); doc.setFont('helvetica','normal');
    doc.text('Relatório de Encerramento', M, 20);
    doc.setFontSize(13); doc.setTextColor(255,255,255); doc.setFont('helvetica','bold');
    doc.text(evNome.slice(0,60), M, 29);
    doc.setFontSize(7.5); doc.setTextColor(140,140,140); doc.setFont('helvetica','normal');
    doc.text('Gerado em ' + now.toLocaleString('pt-BR') + '  ·  Encerrado por: ' + sessUser, M, 36);
    y = 50;

    // ── Resumo de ocupação ───────────────────────────────────────
    doc.setFillColor(235,248,240);
    doc.roundedRect(M, y, W-M*2, 22, 2, 2, 'F');
    var rs = [
      {v:String(total),         l:'Total de baias',  x:M+6},
      {v:String(reserv.length), l:'Reservadas',       x:M+52},
      {v:pct+'%',               l:'Taxa de ocupação', x:M+94},
      {v:String(disp.length),   l:'Disponíveis',      x:M+138},
      {v:String(bloq.length),   l:'Bloqueadas',       x:M+170},
    ];
    rs.forEach(function(r){
      doc.setTextColor(20,20,20); doc.setFontSize(14); doc.setFont('helvetica','bold');
      doc.text(r.v, r.x, y+13);
      doc.setTextColor(100,100,100); doc.setFontSize(6.5); doc.setFont('helvetica','normal');
      doc.text(r.l, r.x, y+19);
    });
    y += 30;

    // ── Lista de competidores ────────────────────────────────────
    // Agrupar baias por titular (um competidor pode ter múltiplas reservas)
    var porTitular = {};
    reserv.forEach(function(s) {
      var nome = (s.holderName||'Sem nome').trim();
      if (!porTitular[nome]) {
        porTitular[nome] = { baias:[], tel: s.contactPhone||'—', reservadoEm: s.reservedAt };
      }
      porTitular[nome].baias.push(s.number);
    });

    var titulares = Object.keys(porTitular).sort();

    secao('COMPETIDORES E BAIAS RESERVADAS (' + titulares.length + ' titular(es) · ' + reserv.length + ' baia(s))');

    if (!titulares.length) {
      linha('Nenhuma baia reservada.', [150,150,150]);
    } else {
      titulares.forEach(function(nome, i) {
        novaPaginaSe(265);
        var info = porTitular[nome];
        info.baias.sort(function(a,b){return a-b;});
        var numBaias = info.baias.map(function(n){ return String(n).padStart(3,'0'); }).join(', ');
        var dataRes  = info.reservadoEm ? new Date(info.reservadoEm).toLocaleString('pt-BR') : '—';

        // Linha colorida alternada
        if (i%2===0) { doc.setFillColor(248,252,249); doc.rect(M, y-1, W-M*2, 22, 'F'); }

        doc.setTextColor(20,20,20); doc.setFontSize(9.5); doc.setFont('helvetica','bold');
        doc.text((i+1)+'. '+nome.slice(0,50), M+3, y+5);

        doc.setTextColor(80,80,80); doc.setFontSize(7.5); doc.setFont('helvetica','normal');
        doc.text('Qtd.: '+info.baias.length+'  ·  Tel.: '+info.tel+'  ·  Reservado em: '+dataRes, M+3, y+11);

        // Baias em destaque
        doc.setTextColor(30,100,60); doc.setFontSize(7.5); doc.setFont('helvetica','bold');
        var lsBaias = wrap('Baias: ' + numBaias, 115);
        lsBaias.forEach(function(l, li) {
          novaPaginaSe(275);
          doc.text(l, M+3, y+17+(li*5));
        });
        y += 22 + Math.max(0, (lsBaias.length-1)*5);
      });
    }
    y += 4;

    // ── Baias não reservadas ─────────────────────────────────────
    novaPaginaSe(250);
    secao('BAIAS NÃO RESERVADAS (' + disp.length + ')');
    if (!disp.length) {
      linha('Todas as baias foram reservadas.', [80,80,80]);
    } else {
      var nums = disp.sort(function(a,b){return a.number-b.number;})
                     .map(function(s){return String(s.number).padStart(3,'0');}).join(', ');
      wrap(nums, 115).forEach(function(l){
        novaPaginaSe(275);
        linha(l, [80,80,80]);
      });
    }
    y += 4;

    // ── Baias bloqueadas / manutenção ────────────────────────────
    if (bloq.length > 0) {
      novaPaginaSe(250);
      secao('BAIAS BLOQUEADAS / MANUTENÇÃO (' + bloq.length + ')');
      bloq.sort(function(a,b){return a.number-b.number;}).forEach(function(s){
        novaPaginaSe(275);
        doc.setTextColor(80,80,80); doc.setFontSize(7.5); doc.setFont('helvetica','normal');
        doc.text(String(s.number).padStart(3,'0')+'  '+statusLabel(s.status), M+3, y);
        y += 5.5;
      });
      y += 4;
    }

    // ── Histórico de ações ───────────────────────────────────────
    novaPaginaSe(240);
    secao('HISTÓRICO DE AÇÕES (' + historico.length + ')');
    if (!historico.length) {
      linha('Nenhuma ação registrada.', [150,150,150]);
    } else {
      var histCron = historico.slice().sort(function(a,b){ return (a.ts||0)-(b.ts||0); });
      histCron.forEach(function(a, i) {
        novaPaginaSe(270);
        if (i%2===0) { doc.setFillColor(250,250,250); doc.rect(M, y-1, W-M*2, 9, 'F'); }
        var dataH = a.at ? new Date(a.at).toLocaleString('pt-BR') : '—';
        var baiaH = a.baia ? ' · Baia '+String(a.baia).padStart(3,'0') : '';
        var extraH = a.extra ? ' · '+a.extra : '';
        doc.setTextColor(30,30,30); doc.setFontSize(7.5); doc.setFont('helvetica','bold');
        doc.text((a.acao||'').slice(0,30)+baiaH.slice(0,20), M+3, y+5);
        doc.setFont('helvetica','normal'); doc.setTextColor(120,120,120);
        doc.text(dataH+'  ·  '+( a.usuario||'org')+extraH.slice(0,30), M+3, y+9.5);
        y += 13;
      });
    }

    // ── Rodapé ───────────────────────────────────────────────────
    var pages = doc.getNumberOfPages();
    for (var p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFillColor(240, 240, 240);
      doc.rect(0, 287, W, 10, 'F');
      doc.setTextColor(150,150,150); doc.setFontSize(7); doc.setFont('helvetica','normal');
      doc.text('Baia Fácil · ' + evNome, M, 293);
      doc.text('Página ' + p + ' de ' + pages, W-M-20, 293);
    }

    // Download
    var nomeArq = 'relatorio-' + evNome.replace(/[^a-zA-Z0-9]/g,'-').toLowerCase() + '-' +
                  now.toISOString().slice(0,10) + '.pdf';
    doc.save(nomeArq);
  }

  // ── W: Log de acessos ────────────────────────────────────────
  function carregarAcessos() {
    if (!window.FB || !window.FB.getAcessos) return;
    window.FB.getAcessos(evId).then(function(acessos) {
      var el = document.getElementById('acessosCount');
      var elLast = document.getElementById('acessosLast');
      if (el) el.textContent = acessos.length;
      if (elLast && acessos.length > 0) {
        var ultimo = acessos.sort(function(a,b){ return b.ts - a.ts; })[0];
        elLast.textContent = new Date(ultimo.at).toLocaleString('pt-BR');
      } else if (elLast) {
        elLast.textContent = '—';
      }
    }).catch(function(){});
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

  // CORREÇÃO: implementar exportação em PDF (era botão sem listener)
  function exportPDF() {
    if (!cache) return;
    var evNome = elSel.options[elSel.selectedIndex] ? elSel.options[elSel.selectedIndex].text : 'Evento';
    var now    = new Date().toLocaleString('pt-BR');
    var reservadas = cache.stalls.filter(function(s){return s.status==='reserved';});
    var rows = reservadas.map(function(s){
      return '<tr><td>'+fmt(s.number)+'</td><td>'+esc(s.holderName||'—')+'</td>'+
        '<td>'+(s.requestedStalls||'—')+'</td><td>'+esc(s.contactPhone||'—')+'</td>'+
        '<td>'+(s.reservedAt?new Date(s.reservedAt).toLocaleString('pt-BR'):'—')+'</td></tr>';
    }).join('');
    var html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>'+
      '<title>Reservas — '+esc(evNome)+'</title>'+
      '<style>body{font-family:\'Segoe UI\',sans-serif;margin:2rem;color:#1c2431}'+
      'h1{font-size:1.3rem;margin-bottom:.25rem}p{color:#666;font-size:.85rem;margin:0 0 1rem}'+
      'table{width:100%;border-collapse:collapse;font-size:.88rem}'+
      'th,td{padding:.45rem .6rem;border:1px solid #ddd;text-align:left}'+
      'th{background:#060f08;color:#c9a84c;font-weight:600}tr:nth-child(even){background:#f9f9f9}'+
      '.footer{margin-top:1.5rem;font-size:.75rem;color:#999;border-top:1px solid #eee;padding-top:.5rem}'+
      '@media print{body{margin:1cm}}</style></head><body>'+
      '<h1>Reservas — '+esc(evNome)+'</h1><p>Gerado em '+now+' · '+reservadas.length+' reserva(s)</p>'+
      '<table><thead><tr><th>Baia</th><th>Titular</th><th>Qtd.</th><th>Contato</th><th>Reservado em</th></tr></thead>'+
      '<tbody>'+rows+'</tbody></table>'+
      '<div class="footer">Baia Fácil · '+esc(evNome)+'</div>'+
      '<script>window.onload=function(){window.print();}<\/script></body></html>';
    var blob = new Blob([html],{type:'text/html;charset=utf-8'});
    var url  = URL.createObjectURL(blob);
    var a    = Object.assign(document.createElement('a'),{href:url,download:'reservas-'+evId+'.html'});
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    msg('PDF gerado! Abra o arquivo e use Ctrl+P para imprimir.');
  }
});
