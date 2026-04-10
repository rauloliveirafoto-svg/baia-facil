/* ============================================================
 * firebase.js — conexão com Firestore
 * ============================================================ */
(function() {
  var cfg = {
    apiKey:            'AIzaSyBlzdSYuhpVoDQgDtmXaDf6q_sdHXrotxI',
    authDomain:        'baia-facil.firebaseapp.com',
    projectId:         'baia-facil',
    storageBucket:     'baia-facil.firebasestorage.app',
    messagingSenderId: '884178519628',
    appId:             '1:884178519628:web:de4343fc588e2cb18416e9',
  };

  if (!firebase.apps.length) {
    firebase.initializeApp(cfg);
  }
  var db = firebase.firestore();

  function ref(evId) { return db.collection('provas').doc(String(evId)); }

  // ── H: Cache local (fallback offline) ────────────────────────
  // Salva o estado da prova no localStorage após cada leitura bem-sucedida.
  // Se o Firebase estiver indisponível, usa o cache como fallback de leitura.
  var LS_PREFIX = 'baiafacil_cache_ev_';

  function cacheSalvar(evId, data) {
    try {
      localStorage.setItem(LS_PREFIX + evId, JSON.stringify({
        data: data,
        savedAt: Date.now(),
      }));
    } catch(e) { /* localStorage cheio ou bloqueado */ }
  }

  function cacheCarregar(evId) {
    try {
      var raw = localStorage.getItem(LS_PREFIX + evId);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      // Cache válido por até 24h
      if (Date.now() - obj.savedAt > 24 * 60 * 60 * 1000) return null;
      return obj.data;
    } catch(e) { return null; }
  }

  // ── Leitura ──────────────────────────────────────────────
  async function initProva(evId, evName) {
    var snap;
    try {
      snap = await ref(evId).get();
    } catch(e) {
      // H: Firebase indisponível — tentar cache local
      console.warn('[initProva] Firebase offline, usando cache local:', e.message);
      var cached = cacheCarregar(evId);
      if (cached) {
        console.info('[initProva] Cache local carregado para ev', evId);
        return cached;
      }
      throw e; // sem cache, propaga o erro
    }
    if (snap.exists) {
      var data = snap.data();
      var dirty = false;

      // Migração: adicionar campo block se ausente
      if (data.stalls && data.stalls.length > 0 && !data.stalls[0].hasOwnProperty('block')) {
        var blocos = (window.BAIA_CONFIG && window.BAIA_CONFIG.STALL_BLOCKS) || [
          {id:1,stalls:30,start:1},{id:2,stalls:30,start:31},{id:3,stalls:30,start:61},
          {id:4,stalls:30,start:91},{id:5,stalls:20,start:121},
        ];
        data.stalls.forEach(function(s) {
          var bloco = blocos.find(function(b){ return s.number >= b.start && s.number < b.start + b.stalls; });
          s.block = bloco ? bloco.id : 1;
        });
        dirty = true;
      }

      // ── FUNÇÃO 1: Limpar baias "selected/blocked" órfãs ──────
      // Uma baia é órfã se:
      //   - status é 'selected' ou 'blocked'
      //   - selectedAt existe e tem mais de 10 minutos
      // Isso cobre casos em que o browser foi fechado abruptamente
      // (mobile, queda de conexão, aba fechada sem beforeunload)
      var ORFAO_TTL = 10 * 60 * 1000; // 10 minutos em ms
      var agora = Date.now();
      if (data.stalls) {
        data.stalls.forEach(function(s) {
          if ((s.status === 'selected' || s.status === 'blocked') && s.selectedAt) {
            var idade = agora - new Date(s.selectedAt).getTime();
            if (idade > ORFAO_TTL) {
              s.status = 'available';
              s.holderName = ''; s.contactPhone = '';
              s.requestedStalls = 0; s.reservedAt = '';
              s.selectedAt = ''; s.sessionId = '';
              dirty = true;
              console.log('[initProva] baia órfã liberada:', s.number);
            }
          }
        });
      }

      if (dirty) {
        ref(evId).set(data).catch(function(e){ console.warn('[initProva] save:', e); });
      }
      cacheSalvar(evId, data); // H: atualizar cache local
      return data;
    }

    // Criar prova nova
    var blocos = (window.BAIA_CONFIG && window.BAIA_CONFIG.STALL_BLOCKS) || [
      {id:1,stalls:30,start:1},{id:2,stalls:30,start:31},{id:3,stalls:30,start:61},
      {id:4,stalls:30,start:91},{id:5,stalls:20,start:121},
    ];
    var stalls = [];
    blocos.forEach(function(bloco) {
      for (var i = 0; i < bloco.stalls; i++) {
        stalls.push({
          number: bloco.start + i, block: bloco.id, status:'available',
          holderName:'', contactPhone:'', requestedStalls:0,
          reservedAt:'', selectedAt:'', sessionId:'',
        });
      }
    });
    var data = { eventName: evName, stalls: stalls, reservations: [], updatedAt: new Date().toISOString() };
    await ref(evId).set(data);
    cacheSalvar(evId, data); // H: salvar cache local da nova prova
    return data;
  }

  async function getProvas() {
    var snap = await db.collection('provas').get();
    var list = [];
    snap.forEach(function(d) { list.push(Object.assign({ id: d.id }, d.data())); });
    return list;
  }

  // ── Escrita ───────────────────────────────────────────────
  function salvar(evId, data) {
    data.updatedAt = new Date().toISOString();
    return ref(evId).set(data).catch(function(e) {
      console.warn('[Firebase] salvar erro, tentando novamente em 3s:', e);
      setTimeout(function() {
        ref(evId).set(data).catch(function(e2) {
          console.error('[Firebase] salvar falhou definitivamente:', e2);
        });
      }, 3000);
    });
  }

  // ── Tempo real ────────────────────────────────────────────
  function escutar(evId, cb) {
    return ref(evId).onSnapshot(
      function(snap) {
        if (snap.exists) {
          cacheSalvar(evId, snap.data()); // H: manter cache atualizado em tempo real
          cb(snap.data());
        }
      },
      function(err) {
        // H: listener perdeu conexão — notificar mas não crashar
        console.warn('[escutar] Firebase desconectado:', err.message);
      }
    );
  }

  // ── Transaction atômica ───────────────────────────────────
  async function reservarAtomico(evId, numeros, titular, telefone, qtd) {
    var resultado = { ok: false, conflito: [] };
    await db.runTransaction(async function(tx) {
      var snap = await tx.get(ref(evId));
      if (!snap.exists) throw new Error('Prova não encontrada');
      var data   = snap.data();
      var stalls = data.stalls || [];
      var conflito = numeros.filter(function(n) {
        var s = stalls.find(function(x) { return x.number === n; });
        if (!s) return true;
        return s.status === 'reserved' || s.status === 'maintenance';
      });
      if (conflito.length > 0) { resultado = { ok: false, conflito: conflito }; return; }
      var now = new Date().toISOString();
      stalls.forEach(function(s) {
        if (s.status === 'selected' || s.status === 'blocked') {
          s.status = 'available'; s.holderName = ''; s.contactPhone = '';
          s.requestedStalls = 0; s.reservedAt = '';
          s.selectedAt = ''; s.sessionId = '';
        }
      });
      numeros.forEach(function(n) {
        var s = stalls.find(function(x) { return x.number === n; });
        if (!s) return;
        s.status = 'reserved'; s.holderName = titular;
        s.contactPhone = telefone; s.requestedStalls = qtd; s.reservedAt = now;
        s.selectedAt = ''; s.sessionId = '';
      });
      data.updatedAt    = now;
      // Gerar protocolo da transação para busca futura
      var txProto = 'BF-' + new Date().toISOString().slice(2,10).replace(/-/g,'') + '-' +
                    Date.now().toString(36).slice(-4).toUpperCase();
      data.reservations = stalls.filter(function(s) { return s.status === 'reserved'; })
        .map(function(s) { return { stallNumber:s.number, holderName:s.holderName,
          contactPhone:s.contactPhone, requestedStalls:s.requestedStalls,
          status:'Confirmada', reservedAt:s.reservedAt,
          protocolo: txProto }; });
      tx.set(ref(evId), data);
      resultado = { ok: true, data: data };
    });
    return resultado;
  }

  // ── FUNÇÃO 3: Buscar reservas por telefone (todas as provas) ──
  async function buscarReservasPorTelefone(telefone) {
    var tel = telefone.replace(/\D/g, '');
    var snap = await db.collection('provas').get();
    var resultados = [];
    snap.forEach(function(doc) {
      var data = doc.data();
      var baias = (data.stalls || []).filter(function(s) {
        return s.status === 'reserved' && s.contactPhone &&
               s.contactPhone.replace(/\D/g, '') === tel;
      });
      if (baias.length > 0) {
        resultados.push({
          evId:      doc.id,
          evNome:    data.eventName || 'Evento',
          baias:     baias,
        });
      }
    });
    return resultados;
  }

  // ── S: Buscar reservas por protocolo ────────────────────────────
  async function buscarReservasPorProtocolo(protocolo) {
    var snap = await db.collection('provas').get();
    var resultados = [];
    snap.forEach(function(doc) {
      var data = doc.data();
      // Protocolo fica no campo reservedAt não — está no comprovante local.
      // O protocolo é gerado no frontend e não salvo no Firestore hoje.
      // Vamos buscar pelo campo 'protocolo' nas reservations se existir,
      // ou pelo holderName+baias como fallback visual.
      // Para funcionar, precisamos salvar o protocolo na reserva — ver reservarAtomico.
      var reservas = (data.reservations || []).filter(function(r) {
        return r.protocolo && r.protocolo.toUpperCase() === protocolo;
      });
      if (reservas.length > 0) {
        // Buscar baias correspondentes
        var nums = reservas.map(function(r){ return r.stallNumber; });
        var baias = (data.stalls || []).filter(function(s){
          return nums.indexOf(s.number) >= 0;
        });
        if (baias.length > 0) {
          resultados.push({ evId: doc.id, evNome: data.eventName || 'Evento', baias: baias });
        }
      }
    });
    return resultados;
  }

  // ── W: Log de acessos por prova ──────────────────────────────
  // Registra um acesso anônimo toda vez que alguém entra numa prova.
  // Usa sub-collection 'acessos' para não poluir o documento principal.
  function registrarAcesso(evId) {
    try {
      db.collection('provas').doc(String(evId))
        .collection('acessos')
        .add({
          at: new Date().toISOString(),
          ua: navigator.userAgent.slice(0, 120),
          ts: Date.now(),
        })
        .catch(function(e){ /* silencioso — log não é crítico */ });
    } catch(e) { /* silencioso */ }
  }

  async function getAcessos(evId) {
    var snap = await db.collection('provas').doc(String(evId))
      .collection('acessos').orderBy('ts','desc').limit(200).get();
    var list = [];
    snap.forEach(function(d){ list.push(d.data()); });
    return list;
  }

  window.FB = { initProva, getProvas, salvar, escutar, reservarAtomico,
                buscarReservasPorTelefone, buscarReservasPorProtocolo,
                registrarAcesso, getAcessos };
})();
