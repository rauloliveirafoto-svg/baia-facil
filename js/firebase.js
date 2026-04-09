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

  // ── Leitura ──────────────────────────────────────────────
  async function initProva(evId, evName) {
    var snap = await ref(evId).get();
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
    return ref(evId).onSnapshot(function(snap) { if (snap.exists) cb(snap.data()); });
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
      data.reservations = stalls.filter(function(s) { return s.status === 'reserved'; })
        .map(function(s) { return { stallNumber:s.number, holderName:s.holderName,
          contactPhone:s.contactPhone, requestedStalls:s.requestedStalls,
          status:'Confirmada', reservedAt:s.reservedAt }; });
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

  window.FB = { initProva, getProvas, salvar, escutar, reservarAtomico, buscarReservasPorTelefone };
})();
