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

  // CORREÇÃO: guarda contra dupla inicialização (ex: seed.html carregando este arquivo)
  if (!firebase.apps.length) {
    firebase.initializeApp(cfg);
  }
  var db = firebase.firestore();

  function ref(evId) { return db.collection('provas').doc(String(evId)); }

  // ── Leitura ──────────────────────────────────────────────
  async function initProva(evId, evName) {
    var snap = await ref(evId).get();
    if (snap.exists) return snap.data();
    var stalls = Array.from({ length: 100 }, function(_, i) {
      return { number: i+1, status:'available', holderName:'', contactPhone:'', requestedStalls:0, reservedAt:'' };
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
    return ref(evId).set(data).catch(function(e) { console.warn('[Firebase] salvar erro:', e); });
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
      // CORREÇÃO: aceitar apenas status 'available' — 'selected' pertence a outro competidor
      // que ainda não finalizou; permitir sobrescrita causaria conflito de reserva
      var conflito = numeros.filter(function(n) {
        var s = stalls.find(function(x) { return x.number === n; });
        return !s || s.status !== 'available';
      });
      if (conflito.length > 0) { resultado = { ok: false, conflito: conflito }; return; }
      var now = new Date().toISOString();
      numeros.forEach(function(n) {
        var s = stalls.find(function(x) { return x.number === n; });
        if (!s) return;
        s.status = 'reserved'; s.holderName = titular;
        s.contactPhone = telefone; s.requestedStalls = qtd; s.reservedAt = now;
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

  window.FB = { initProva, getProvas, salvar, escutar, reservarAtomico };
})();
