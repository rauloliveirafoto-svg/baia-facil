/* ============================================================
 * competidor.js — lógica da página do competidor
 * ============================================================ */

// ── Estado global do evento ativo ─────────────────────────────
var _evId    = null;
var _evNome  = null;
var _cache   = null;
var _unsub   = null;

// ── ID único desta sessão de browser ─────────────────────────
// Usado para identificar baias selecionadas por esta aba especificamente.
// Se o browser fechar sem limpar, o initProva do próximo acesso
// detecta baias com selectedAt > 10min e as libera automaticamente.
var _sessionId = 'sess-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);

// ── Helpers ───────────────────────────────────────────────────
function fmt(n)           { return String(n).padStart(3,'0'); }
function maskTel(v)       { var d=v.replace(/\D/g,'').slice(0,11); if(d.length<=2)return d; if(d.length<=6)return'('+d.slice(0,2)+') '+d.slice(2); if(d.length<=10)return'('+d.slice(0,2)+') '+d.slice(2,6)+'-'+d.slice(6); return'('+d.slice(0,2)+') '+d.slice(2,7)+'-'+d.slice(7); }
function telValido(v)     { return v.replace(/\D/g,'').length>=8; }
function protocolo()      { var n=new Date(); return 'BF-'+String(n.getFullYear()).slice(-2)+String(n.getMonth()+1).padStart(2,'0')+String(n.getDate()).padStart(2,'0')+'-'+Date.now().toString(36).slice(-4).toUpperCase(); }

// ── Storage ───────────────────────────────────────────────────
function getState()       { return _cache; }

function updateState(fn) {
  if (!_cache) return;
  try { fn(_cache); } catch(e) { console.error('[updateState]', e); return; }

  // Garantir que baias selected/blocked desta sessão tenham selectedAt e sessionId.
  // O firebase.js usa esses campos para detectar e liberar baias órfãs
  // (browser fechado abruptamente sem acionar beforeunload).
  var agora = new Date().toISOString();
  (_cache.stalls || []).forEach(function(s) {
    if (s.status === 'selected' || s.status === 'blocked') {
      if (!s.selectedAt)  s.selectedAt  = agora;
      if (!s.sessionId)   s.sessionId   = _sessionId;
    } else if (s.status === 'available' || s.status === 'reserved') {
      // Limpar campos de sessão ao liberar ou confirmar
      s.selectedAt = ''; s.sessionId = '';
    }
  });

  _cache.updatedAt    = new Date().toISOString();
  _cache.reservations = (_cache.stalls||[]).filter(function(s){return s.status==='reserved';})
    .map(function(s){return{stallNumber:s.number,holderName:s.holderName,
      contactPhone:s.contactPhone,requestedStalls:s.requestedStalls,
      status:'Confirmada',reservedAt:s.reservedAt};});
  window.BAIA_STATE.stalls = _cache.stalls || [];
  if (_evId) window.FB.salvar(_evId, _cache);
}

// CORREÇÃO: expor updateState globalmente para que index.html possa chamar ao voltar para home
window.updateState = updateState;

// ── Chamado pelo index.html ao entrar numa prova ──────────────
window.entrarProva = async function(evId, evNome) {
  _evId   = String(evId);
  _evNome = evNome;
  if (_unsub) { _unsub(); _unsub = null; }
  _cache = await window.FB.initProva(_evId, _evNome);
  window.BAIA_STATE.stalls = _cache.stalls || [];
  // W: registrar acesso anônimo para estatísticas
  if (window.FB && window.FB.registrarAcesso) window.FB.registrarAcesso(_evId);
};

window.iniciarListenerCompetidor = function(onUpdate) {
  if (_unsub) { _unsub(); _unsub = null; }
  if (!_evId) return;
  _unsub = window.FB.escutar(_evId, function(data) {
    // CORREÇÃO: só aceitar dados do Firebase se o cache já foi populado (evitar race condition)
    // O listener pode disparar antes de entrarProva terminar; ignorar se _cache ainda é null
    if (!_cache) return;
    _cache = data;
    window.BAIA_STATE.stalls = data.stalls || [];
    if (onUpdate) onUpdate();
  });
};

window.pararListenerCompetidor = function() {
  if (_unsub) { _unsub(); _unsub = null; }
};

// ── Init da página ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  if (document.body.dataset.page !== 'competidor') return;

  var $ = function(id) { return document.getElementById(id); };

  // Elementos
  var evNomeEl        = $('eventName');
  var nomeEl          = $('competitorName');
  var creditsEl       = $('stallCredits');
  var timerEl         = $('timer');
  var feedbackEl      = $('feedback');
  var intakeSection   = $('reservationIntake');
  var intakeNome      = $('intakeHolder');
  var intakeQtd       = $('intakeQuantity');
  var intakeTel       = $('intakePhone');
  var intakeErro      = $('intakeError');
  var startBtn        = $('startReservationFlow');
  var mapSection      = $('competitorMapSection');
  var mapEl           = $('stallMap');
  var tplEl           = $('stallTemplate');
  var finishBtn       = $('finishReservation');
  var seqModal        = $('sequenceModal');
  var seqList         = $('sequenceList');
  var acceptBtn       = $('acceptSequence');
  var rejectBtn       = $('rejectSequence');
  var receiptModal    = $('receiptModal');
  var receiptContent  = $('receiptContent');
  var receiptProtocol = $('receiptProtocol');
  var downloadBtn     = $('downloadReceipt');
  var whatsappBtn     = $('whatsappReceipt');
  var closeReceiptBtn = $('closeReceipt');

  var state = window.BAIA_STATE.competitor;

  // ── Reset de estado ───────────────────────────────────────
  function resetar() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
    state.holderName=''; state.requestedStalls=0; state.contactPhone='';
    state.selectedStalls=[]; state.suggestedSequence=[];
    state.mode=null; state.remainingSeconds=300; state.receipt=null; state._receiptUsed=false;
    window.BAIA_STATE.selectedStalls    = state.selectedStalls;
    window.BAIA_STATE.competitorCredits = 0;
    window.BAIA_STATE.timer.isActive    = false;
    window.BAIA_STATE.reservation.status = 'inactive';
    lastRender = new Map();
  }

  resetar();

  var btnPorNumero = new Map();
  var lastRender   = new Map();
  var _blocoFiltro = null; // bloco ativo selecionado no mapa aéreo

  // ── Mostrar todos os blocos (chamado ao avançar do mapa aéreo) ──
  window._mostrarTodosBlocos = function() {
    _blocoFiltro = null;
    lastRender = new Map();
    btnPorNumero.clear();

    // Usa buildStallMapVertical — todos os blocos em 2 colunas verticais
    window.BAIA_MAP.buildStallMapVertical({
      mapElement:   mapEl,
      template:     tplEl,
      onStallClick: function(n) { ctrlSelecao.handleStallClick(n); },
    });

    mapEl.querySelectorAll('.stall').forEach(function(b) {
      btnPorNumero.set(Number(b.dataset.stallNumber), b);
    });

    ctrlSelecao.setTotalStalls(140);
    if (mapSection) mapSection.hidden = false;
    refreshMap();
  };

  // ── Filtrar por bloco (chamado pelo index.html ao clicar num bloco) ──
  window._filtrarBloco = function(bloco) {
    _blocoFiltro = bloco;
    lastRender = new Map(); // forçar re-render completo

    // Reconstruir o mapa apenas com as baias do bloco
    mapEl.innerHTML = '';
    btnPorNumero.clear();

    var blocoConfig = {
      id: bloco.id,
      label: bloco.label || ('Bloco ' + bloco.id),
      stalls: bloco.stalls,
      start: bloco.start,
    };

    window.BAIA_MAP.buildStallMapBloco({
      mapElement: mapEl,
      template:   tplEl,
      bloco:      blocoConfig,
      onStallClick: function(n) { ctrlSelecao.handleStallClick(n); },
    });

    mapEl.querySelectorAll('.stall').forEach(function(b) {
      btnPorNumero.set(Number(b.dataset.stallNumber), b);
    });

    // Atualizar total de baias no controlador
    ctrlSelecao.setTotalStalls(bloco.stalls);

    refreshMap();
  };

  // ── Controlador de seleção ────────────────────────────────
  // CORREÇÃO: actions agora inclui refreshMap (nome correto) em vez de refreshCompetitorMap
  var ctrlSelecao = window.BAIA_SELECTION.createSelectionController({
    state:     state,
    constants: { totalStalls: 140 },
    ui:        { mapSection, sequenceModal:seqModal, sequenceList:seqList, finishButton:finishBtn, feedbackEl: feedbackEl||{textContent:''} },
    helpers:   { formatStall: fmt },
    actions:   { getState, updateState, clearCurrentSelection, refreshMap, startTimer },
  });

  // ── L: Indicador de conexão ─────────────────────────────────
  var compConnPill  = document.getElementById('compConnPill');
  var compConnDot   = document.getElementById('compConnDot');
  var compConnLabel = document.getElementById('compConnLabel');

  function setCompConn(estado) {
    if (!compConnPill) return;
    compConnPill.className = 'conn-pill' + (estado !== 'online' ? ' ' + estado : '');
    if (compConnLabel) compConnLabel.textContent =
      estado === 'online' ? 'online' : estado === 'syncing' ? 'sincronizando' : 'offline';
  }

  window.addEventListener('online',  function() { setCompConn('online');  });
  window.addEventListener('offline', function() { setCompConn('offline'); });
  setCompConn(navigator.onLine ? 'online' : 'offline');

  // ── Tooltip no hover do mapa ─────────────────────────────────
  var compTooltip   = document.getElementById('compTooltip');
  var compTipNum    = document.getElementById('compTipNum');
  var compTipStatus = document.getElementById('compTipStatus');
  var compTipHolder = document.getElementById('compTipHolder');

  var STATUS_LABEL = {
    available:   'Disponível',
    selected:    'Em seleção',
    blocked:     'Bloqueio temporário',
    reserved:    'Reservada',
    maintenance: 'Manutenção',
  };

  if (compTooltip && mapEl) {
    mapEl.addEventListener('mouseover', function(e) {
      var btn = e.target.closest('.stall');
      if (!btn) { compTooltip.classList.remove('visible'); return; }
      var n = Number(btn.dataset.stallNumber);
      var storage = getState();
      if (!storage) return;
      var s = storage.stalls.find(function(x){ return x.number === n; });
      if (!s) return;

      compTipNum.textContent    = 'Baia ' + fmt(n);
      compTipStatus.textContent = STATUS_LABEL[s.status] || s.status;

      // Mostrar titular só em baias reservadas — não expor dados de outros em seleção
      if (s.status === 'reserved' && s.holderName) {
        compTipHolder.textContent = s.holderName;
        compTipHolder.style.display = 'block';
      } else {
        compTipHolder.style.display = 'none';
      }

      compTooltip.classList.add('visible');
    });

    mapEl.addEventListener('mousemove', function(e) {
      if (!compTooltip.classList.contains('visible')) return;
      var x = e.clientX + 14, y = e.clientY + 14;
      if (x + 230 > window.innerWidth)  x = e.clientX - 234;
      if (y + 120 > window.innerHeight) y = e.clientY - 124;
      compTooltip.style.left = x + 'px';
      compTooltip.style.top  = y + 'px';
    });

    mapEl.addEventListener('mouseleave', function() {
      compTooltip.classList.remove('visible');
    });
  }

  // ── Modo visualização (somente-leitura) ─────────────────────
  var _viewMode = false;

  window._ativarModoVisualizacao = function() {
    _viewMode = true;
    // Esconder o intake e o botão finalizar
    if (intakeSection) intakeSection.hidden = true;
    if (finishBtn)     finishBtn.hidden     = true;
    if (mapSection)    mapSection.hidden    = false;
  };

  window._desativarModoVisualizacao = function() {
    _viewMode = false;
    if (finishBtn) finishBtn.hidden = false;
  };

  // ── Exposto para index.html ───────────────────────────────
  window._entrarEvento = function(evNome) {
    resetar();
    if (evNomeEl)  evNomeEl.textContent  = evNome || '';
    if (creditsEl) creditsEl.textContent = '0';
    if (timerEl)   timerEl.textContent   = '--:--';
    if (feedbackEl) feedbackEl.textContent = '';
    window.iniciarListenerCompetidor(refreshMap);
    refreshMap();
  };

  // ── Listeners ─────────────────────────────────────────────
  if (intakeTel) intakeTel.addEventListener('input', function() { intakeTel.value = maskTel(intakeTel.value); });

  startBtn.addEventListener('click', async function() {
    intakeErro.textContent = '';
    var nome  = intakeNome.value.trim();
    var qtd   = Number(intakeQtd.value);
    var tel   = maskTel(intakeTel.value);
    intakeTel.value = tel;

    if (!nome || !qtd || qtd<1 || !tel) { intakeErro.textContent='Preencha todos os campos.'; return; }
    if (!Number.isInteger(qtd) || qtd<=0) { intakeErro.textContent='Quantidade inválida.'; return; }
    var cur = getState();
    var disp = cur ? cur.stalls.filter(function(s){return s.status==='available';}).length : 100;
    if (qtd > disp) { intakeErro.textContent='Apenas '+disp+' baia(s) disponível(is).'; return; }
    if (!telValido(tel)) { intakeErro.textContent='Telefone inválido.'; return; }

    state.holderName = nome; state.requestedStalls = qtd; state.contactPhone = tel;
    window.BAIA_STATE.competitorCredits = qtd;

    // Esconder o intake para sinalizar ao index.html que a validação passou.
    // O mapa de baias (mapSection) é aberto apenas após o competidor
    // selecionar um bloco no mapa aéreo — via window._filtrarBloco().
    intakeSection.hidden = true;
  });

  finishBtn.addEventListener('click', finalizar);
  acceptBtn.addEventListener('click', ctrlSelecao.acceptSequence);
  rejectBtn.addEventListener('click', ctrlSelecao.rejectSequence);
  closeReceiptBtn.addEventListener('click', function() {
    receiptModal.hidden = true;
    // Se download ou whatsapp já foram usados, voltar para home
    if (state._receiptUsed && typeof window._goHomeCallback === 'function') {
      setTimeout(window._goHomeCallback, 300);
    }
  });

  if (whatsappBtn) {
    whatsappBtn.addEventListener('click', function() {
      if (!state.receipt) return;
      state._receiptUsed = true;
      var r   = state.receipt;
      var tel = r.contactPhone ? r.contactPhone.replace(/[^0-9]/g, '') : '';
      // Garantir código do Brasil
      if (tel.length === 11) tel = '55' + tel;
      else if (tel.length === 10) tel = '55' + tel;

      var baias = r.baias.map(fmt).join(', ');
      var data  = r.timestamp.toLocaleString('pt-BR');

      var msg =
        '*✅ RESERVA CONFIRMADA — BAIA FÁCIL*' + '%0A%0A' +
        '*Protocolo:* ' + r.protocolo + '%0A' +
        '*Evento:* ' + encodeURIComponent(r.evento) + '%0A' +
        '*Titular:* ' + encodeURIComponent(r.titular) + '%0A' +
        '*Baia(s):* ' + encodeURIComponent(baias) + '%0A' +
        '*Data:* ' + encodeURIComponent(data) + '%0A%0A' +
        encodeURIComponent('Guarde esta mensagem como comprovante.');

      var url = 'https://wa.me/' + tel + '?text=' + msg;
      window.open(url, '_blank');
    });
  }

  downloadBtn.addEventListener('click', function() {
    if (!state.receipt) return;
    state._receiptUsed = true;
    var html = buildComprovante(state.receipt);
    var blob = new Blob([html], { type:'text/html;charset=utf-8' });
    var url  = URL.createObjectURL(blob);
    var a    = Object.assign(document.createElement('a'), { href:url, download:'comprovante-'+state.receipt.protocolo+'.html' });
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });

  window.addEventListener('beforeunload', function(e) {
    if (state.selectedStalls && state.selectedStalls.length > 0) {
      e.preventDefault();
      e.returnValue = 'Você tem baias selecionadas. Sair vai cancelar sua reserva.';
    }
  });

  // ── Funções internas ──────────────────────────────────────
  function clearCurrentSelection() {
    var affected = (state.selectedStalls||[]).concat(state.suggestedSequence||[]);
    updateState(function(next) {
      affected.forEach(function(num) {
        var s = next.stalls.find(function(x){return x.number===num;});
        if (s && (s.status==='selected'||s.status==='blocked')) {
          s.status='available'; s.holderName=''; s.contactPhone=''; s.requestedStalls=0; s.reservedAt='';
        }
      });
    });
    state.selectedStalls=[]; window.BAIA_STATE.selectedStalls=[];
    state.suggestedSequence=[]; state.mode=null;
    window.BAIA_STATE.reservation.status='finalized';
    finishBtn.disabled=true; seqModal.hidden=true;
    stopTimer(); refreshMap();
  }

  async function finalizar() {
    if (!state.selectedStalls||!state.selectedStalls.length||!state.requestedStalls) return;
    var numeros = state.mode==='sequence'
      ? state.selectedStalls.concat(state.suggestedSequence).slice(0, state.requestedStalls)
      : state.selectedStalls.slice(0, state.requestedStalls);

    // Proteção: não confirmar reserva incompleta (modo manual com menos baias que o pedido)
    if (numeros.length < state.requestedStalls) {
      if (feedbackEl) feedbackEl.textContent =
        'Selecione '+state.requestedStalls+' baia(s). Você selecionou '+numeros.length+'.';
      finishBtn.disabled = false;
      return;
    }

    // Proteção contra duplo submit
    if (finishBtn.disabled) return;

    var now = new Date();
    finishBtn.disabled = true;
    if (feedbackEl) feedbackEl.textContent = 'Confirmando reserva...';

    var res;
    try {
      res = await window.FB.reservarAtomico(_evId, numeros, state.holderName, state.contactPhone, state.requestedStalls);
    } catch(e) {
      console.error('[finalizar]', e);
      updateState(function(next) {
        numeros.forEach(function(n) {
          var s = next.stalls.find(function(x){return x.number===n;});
          if (!s) return;
          s.status='reserved'; s.holderName=state.holderName;
          s.contactPhone=state.contactPhone; s.requestedStalls=state.requestedStalls;
          s.reservedAt=now.toISOString();
        });
      });
      res = { ok:true, data:getState() };
    }

    if (!res.ok) {
      var conf = res.conflito.map(fmt).join(', ');
      if (feedbackEl) feedbackEl.textContent = 'Baia(s) '+conf+' já reservada(s). Selecione outras.';
      state.selectedStalls = state.selectedStalls.filter(function(n){return res.conflito.indexOf(n)<0;});
      state.suggestedSequence = state.suggestedSequence.filter(function(n){return res.conflito.indexOf(n)<0;});
      window.BAIA_STATE.selectedStalls = state.selectedStalls;
      if (state.selectedStalls.length===0) { state.mode=null; finishBtn.disabled=true; seqModal.hidden=true; stopTimer(); }
      else { finishBtn.disabled=false; }
      refreshMap(); return;
    }

    if (res.data) { _cache=res.data; window.BAIA_STATE.stalls=res.data.stalls||[]; }

    state.receipt = {
      protocolo:  protocolo(),
      evento:     _evNome || (evNomeEl&&evNomeEl.textContent) || 'Evento',
      titular:    state.holderName,
      baias:      numeros,
      timestamp:  now,
      status:     'Confirmada',
    };

    if (creditsEl) creditsEl.textContent = '0';
    if (feedbackEl) feedbackEl.textContent = 'Reserva confirmada: baias '+numeros.map(fmt).join(', ');
    mostrarComprovante();

    state.selectedStalls=[]; window.BAIA_STATE.selectedStalls=[];
    state.suggestedSequence=[]; state.mode=null;
    window.BAIA_STATE.reservation.status='finalized';
    seqModal.hidden=true; stopTimer(); refreshMap();
  }

  function mostrarComprovante() {
    if (!state.receipt) return;
    if (receiptProtocol) receiptProtocol.textContent = state.receipt.protocolo;
    if (receiptContent) receiptContent.innerHTML =
      '<p style="margin:.3rem 0;font-size:.9rem;"><strong>Evento:</strong> '+state.receipt.evento+'</p>'+
      '<p style="margin:.3rem 0;font-size:.9rem;"><strong>Titular:</strong> '+state.receipt.titular+'</p>'+
      '<p style="margin:.3rem 0;font-size:.9rem;"><strong>Baia(s):</strong> '+state.receipt.baias.map(fmt).join(', ')+'</p>'+
      '<p style="margin:.3rem 0;font-size:.9rem;"><strong>Data e hora:</strong> '+state.receipt.timestamp.toLocaleString('pt-BR')+'</p>'+
      '<p style="margin:.3rem 0;font-size:.9rem;"><strong>Status:</strong> <span class="receipt-status">'+state.receipt.status+'</span></p>';
    receiptModal.hidden = false;
  }

  function buildComprovante(r) {
    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>Comprovante '+r.protocolo+'</title>'+
      '<style>body{font-family:\'Segoe UI\',sans-serif;margin:0;background:#f5f5f5;color:#1c2431}'+
      '.wrap{max-width:520px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.12)}'+
      '.hdr{background:#060f08;padding:28px 32px;text-align:center;color:#c9a84c;font-family:Georgia,serif;font-size:1.3rem;font-weight:700}'+
      '.proto{background:#0d2b10;padding:16px 32px;text-align:center}'+
      '.proto-label{font-size:.7rem;color:#7a9e7e;text-transform:uppercase;letter-spacing:.1em}'+
      '.proto-code{font-size:1.8rem;font-weight:700;color:#c9a84c;margin-top:4px}'+
      '.body{padding:28px 32px}.row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:.92rem}'+
      '.row:last-child{border:none}.row strong{color:#666}'+
      '.status{background:#d4edda;color:#155724;padding:3px 10px;border-radius:999px;font-size:.82rem;font-weight:600}'+
      '.ftr{background:#f9f9f9;padding:14px 32px;text-align:center;font-size:.75rem;color:#999;border-top:1px solid #eee}</style>'+
      '</head><body><div class="wrap">'+
      '<div class="hdr">Baia Fácil — Reservas Equestres</div>'+
      '<div class="proto"><div class="proto-label">Protocolo</div><div class="proto-code">'+r.protocolo+'</div></div>'+
      '<div class="body">'+
      '<div class="row"><strong>Evento</strong><span>'+r.evento+'</span></div>'+
      '<div class="row"><strong>Titular</strong><span>'+r.titular+'</span></div>'+
      '<div class="row"><strong>Baia(s)</strong><span>'+r.baias.map(fmt).join(', ')+'</span></div>'+
      '<div class="row"><strong>Data/Hora</strong><span>'+r.timestamp.toLocaleString('pt-BR')+'</span></div>'+
      '<div class="row"><strong>Status</strong><span class="status">'+r.status+'</span></div>'+
      '</div><div class="ftr">Baia Fácil · '+r.protocolo+'</div></div></body></html>';
  }

  function startTimer() {
    stopTimer();
    state.remainingSeconds = 300;
    window.BAIA_STATE.timer.isActive = true;
    window.BAIA_STATE.reservation.status = 'active';
    setTimerLabel();
    state.timerId = setInterval(function() {
      state.remainingSeconds -= 1;
      setTimerLabel();
      if (state.remainingSeconds <= 0) {
        if (feedbackEl) feedbackEl.textContent = 'Tempo expirado.';
        clearCurrentSelection();
      }
    }, 1000);
  }

  function stopTimer() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
    state.remainingSeconds = 300;
    window.BAIA_STATE.timer.isActive = false;
    setTimerLabel();
  }

  function setTimerLabel() {
    if (!timerEl) return;
    // CORREÇÃO: checar timerId E que há baias efetivamente em uso (selectedStalls OU suggestedSequence)
    // No modo 'sequence', selectedStalls tem só a baia inicial; suggestedSequence tem as demais
    var totalEmUso = (state.selectedStalls||[]).length + (state.suggestedSequence||[]).length;
    if (!totalEmUso || !state.timerId) { timerEl.textContent='--:--'; return; }
    timerEl.textContent = String(Math.floor(state.remainingSeconds/60)).padStart(2,'0')+':'+String(state.remainingSeconds%60).padStart(2,'0');
  }

  function refreshMap() {
    var storage = getState();
    if (!storage||!storage.stalls) return;
    var minhas = new Set(state.selectedStalls||[]);

    // Filtrar apenas as baias do bloco ativo
    var stallsVisiveis = _blocoFiltro
      ? storage.stalls.filter(function(s){ return s.block === _blocoFiltro.id; })
      : storage.stalls;

    stallsVisiveis.forEach(function(stall) {
      var btn = btnPorNumero.get(stall.number);
      if (!btn) return;
      var sig = stall.status + (minhas.has(stall.number)?'_minha':'');
      if (lastRender.get(stall.number) === sig) return;
      btn.classList.remove('stall--selected','stall--blocked','stall--reserved','stall--taken');
      btn.disabled = false;
      if (stall.status==='selected') {
        if (minhas.has(stall.number)) btn.classList.add('stall--selected');
        else { btn.classList.add('stall--taken'); btn.disabled=true; }
      }
      if (stall.status==='blocked')     { btn.classList.add('stall--blocked');  btn.disabled=true; }
      if (stall.status==='reserved'||stall.status==='maintenance') { btn.classList.add('stall--reserved'); btn.disabled=true; }
      lastRender.set(stall.number, sig);
    });

    // Atualizar indicadores do mapa aéreo sempre que o cache mudar
    if (typeof window._atualizarBlocos === 'function') window._atualizarBlocos();
  }
});
