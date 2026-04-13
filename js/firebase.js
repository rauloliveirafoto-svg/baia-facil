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

  // ── Gerador de protocolo sequencial GLOBAL ───────────────────
  // Formato: BF-DDMMAAAA-NNNN  ex: BF-09042025-0001
  // Contador único em db/config/protocolo — garante que não há dois 0001 em provas diferentes.
  // Deve ser chamado DENTRO de uma transaction para garantir atomicidade.
  var refProto = db.collection('config').doc('protocolo');

  // Versão para uso dentro de transaction (recebe tx como parâmetro)
  async function gerarProtocoloGlobal(tx, now) {
    var d       = now || new Date();
    var dd      = String(d.getDate()).padStart(2,'0');
    var mm      = String(d.getMonth()+1).padStart(2,'0');
    var aaaa    = String(d.getFullYear());
    var dataStr = dd + mm + aaaa;

    var snap = await tx.get(refProto);
    var doc  = snap.exists ? snap.data() : {};
    // Resetar sequência a cada novo dia
    var seq  = (doc.dataStr === dataStr) ? (doc.seq || 0) + 1 : 1;
    tx.set(refProto, { dataStr: dataStr, seq: seq, updatedAt: d.toISOString() });
    return 'BF-' + dataStr + '-' + String(seq).padStart(4, '0');
  }

  // Versão fora de transaction (para reservas manuais do organizador)
  async function gerarProtocoloSimples(now) {
    var d       = now || new Date();
    var dd      = String(d.getDate()).padStart(2,'0');
    var mm      = String(d.getMonth()+1).padStart(2,'0');
    var aaaa    = String(d.getFullYear());
    var dataStr = dd + mm + aaaa;
    var resultado = 'BF-' + dataStr + '-0000';
    await db.runTransaction(async function(tx) {
      var snap = await tx.get(refProto);
      var doc  = snap.exists ? snap.data() : {};
      var seq  = (doc.dataStr === dataStr) ? (doc.seq || 0) + 1 : 1;
      tx.set(refProto, { dataStr: dataStr, seq: seq, updatedAt: d.toISOString() });
      resultado = 'BF-' + dataStr + '-' + String(seq).padStart(4, '0');
    });
    return resultado;
  }

  // ── H: Cache local (fallback offline) ────────────────────────
  var LS_PREFIX   = 'baiafacil_cache_ev_';
  var CACHE_TTL   = 24 * 60 * 60 * 1000;  // 24h
  var CACHE_MAX   =  7 * 24 * 60 * 60 * 1000; // 7 dias — limpeza

  function cacheSalvar(evId, data) {
    try {
      localStorage.setItem(LS_PREFIX + evId, JSON.stringify({
        data: data, savedAt: Date.now(),
      }));
    } catch(e) {}
  }

  function cacheCarregar(evId) {
    try {
      var raw = localStorage.getItem(LS_PREFIX + evId);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (Date.now() - obj.savedAt > CACHE_TTL) return null;
      return obj.data;
    } catch(e) { return null; }
  }

  // Limpar entradas de cache com mais de 7 dias
  function cacheLimparExpirados() {
    try {
      var agora = Date.now();
      Object.keys(localStorage).forEach(function(k) {
        if (!k.startsWith(LS_PREFIX)) return;
        try {
          var obj = JSON.parse(localStorage.getItem(k));
          if (obj && obj.savedAt && (agora - obj.savedAt) > CACHE_MAX) {
            localStorage.removeItem(k);
          }
        } catch(e) {}
      });
    } catch(e) {}
  }
  cacheLimparExpirados(); // executar ao carregar o módulo

  // ── Leitura ──────────────────────────────────────────────────
  async function initProva(evId, evName) {
    var snap;
    try {
      snap = await ref(evId).get();
    } catch(e) {
      console.warn('[initProva] Firebase offline, usando cache local:', e.message);
      var cached = cacheCarregar(evId);
      if (cached) return cached;
      throw e;
    }
    if (snap.exists) {
      var data  = snap.data();
      var dirty = false;

      // Sincronizar blocos da prova para o BAIA_CONFIG global
      // Permite que map.js e competidor.js usem os blocos corretos desta prova
      if (data.blocos && Array.isArray(data.blocos)) {
        if (window.BAIA_CONFIG) {
          window.BAIA_CONFIG.STALL_BLOCKS  = data.blocos;
          window.BAIA_CONFIG.TOTAL_STALLS  = data.totalStalls || data.stalls.length;
        }
      }

      // Migração: campo block ausente
      if (data.stalls && data.stalls.length > 0 && !data.stalls[0].hasOwnProperty('block')) {
        var blocos = data.blocos || (window.BAIA_CONFIG && window.BAIA_CONFIG.STALL_BLOCKS) || [
          {id:1,stalls:30,start:1},{id:2,stalls:30,start:31},{id:3,stalls:30,start:61},
          {id:4,stalls:30,start:91},{id:5,stalls:20,start:121},
        ];
        data.stalls.forEach(function(s) {
          var bloco = blocos.find(function(b){ return s.number >= b.start && s.number < b.start + b.stalls; });
          s.block = bloco ? bloco.id : 1;
        });
        dirty = true;
      }

      // Liberar baias órfãs (selected/blocked há mais de 10 min)
      var ORFAO_TTL = 10 * 60 * 1000;
      var agora = Date.now();
      if (data.stalls) {
        data.stalls.forEach(function(s) {
          if ((s.status === 'selected' || s.status === 'blocked') && s.selectedAt) {
            if (agora - new Date(s.selectedAt).getTime() > ORFAO_TTL) {
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

      if (dirty) ref(evId).set(data, { merge: true }).catch(function(e){ console.warn('[initProva] save:', e); });
      cacheSalvar(evId, data);
      return data;
    }

    // Criar prova nova — blocos vêm do config global (já sincronizado se necessário)
    var blocos = (window.BAIA_CONFIG && window.BAIA_CONFIG.STALL_BLOCKS) || [
      {id:1,stalls:30,start:1},{id:2,stalls:30,start:31},{id:3,stalls:30,start:61},
      {id:4,stalls:30,start:91},{id:5,stalls:20,start:121},
    ];
    var stalls = [];
    blocos.forEach(function(bloco) {
      for (var i = 0; i < bloco.stalls; i++) {
        stalls.push({ number:bloco.start+i, block:bloco.id, status:'available',
          holderName:'', contactPhone:'', requestedStalls:0,
          reservedAt:'', selectedAt:'', sessionId:'' });
      }
    });
    var totalStalls = stalls.length;
    var data = { eventName:evName, stalls:stalls, reservations:[],
                 blocos:blocos, totalStalls:totalStalls,
                 updatedAt:new Date().toISOString() };
    await ref(evId).set(data);
    cacheSalvar(evId, data);
    return data;
  }

  async function getProvas() {
    var snap = await db.collection('provas').get();
    var list = [];
    snap.forEach(function(d) { list.push(Object.assign({ id: d.id }, d.data())); });
    return list;
  }

  // ── Escrita ───────────────────────────────────────────────────
  function salvar(evId, data) {
    data.updatedAt = new Date().toISOString();
    // merge:true garante que campos como status/encerradaAt não sejam sobrescritos
    // caso encerrarProva() tenha rodado entre o último get e este set
    return ref(evId).set(data, { merge: true }).catch(function(e) {
      console.warn('[Firebase] salvar erro, retentando em 3s:', e);
      setTimeout(function() {
        ref(evId).set(data, { merge: true }).catch(function(e2) {
          console.error('[Firebase] salvar falhou definitivamente:', e2);
        });
      }, 3000);
    });
  }

  // ── Tempo real ────────────────────────────────────────────────
  function escutar(evId, cb) {
    return ref(evId).onSnapshot(
      function(snap) {
        if (snap.exists) {
          cacheSalvar(evId, snap.data());
          cb(snap.data());
        }
      },
      function(err) {
        console.warn('[escutar] Firebase desconectado:', err.message);
      }
    );
  }

  // ── Transaction atômica ───────────────────────────────────────
  // CRÍTICO CORRIGIDO: protocolo gerado DENTRO da transaction e retornado
  // para que competidor.js use o mesmo código no comprovante.
  async function reservarAtomico(evId, numeros, titular, telefone, qtd) {
    var resultado = { ok: false, conflito: [] };
    await db.runTransaction(async function(tx) {
      var snap = await tx.get(ref(evId));
      if (!snap.exists) throw new Error('Prova não encontrada');
      var data   = snap.data();
      var stalls = data.stalls || [];

      // Bloquear reserva em prova encerrada
      if (data.status === 'encerrada') {
        resultado = { ok:false, encerrada:true, conflito:[] };
        return;
      }

      var conflito = numeros.filter(function(n) {
        var s = stalls.find(function(x) { return x.number === n; });
        if (!s) return true;
        return s.status === 'reserved' || s.status === 'maintenance';
      });
      if (conflito.length > 0) { resultado = { ok:false, conflito:conflito }; return; }

      var now = new Date();
      var nowISO = now.toISOString();

      // Limpar todas as baias selected/blocked
      stalls.forEach(function(s) {
        if (s.status === 'selected' || s.status === 'blocked') {
          s.status='available'; s.holderName=''; s.contactPhone='';
          s.requestedStalls=0; s.reservedAt=''; s.selectedAt=''; s.sessionId='';
        }
      });

      // Reservar as baias confirmadas
      numeros.forEach(function(n) {
        var s = stalls.find(function(x) { return x.number === n; });
        if (!s) return;
        s.status='reserved'; s.holderName=titular;
        s.contactPhone=telefone; s.requestedStalls=qtd; s.reservedAt=nowISO;
        s.selectedAt=''; s.sessionId='';
      });

      // Gerar protocolo sequencial global BF-DDMMAAAA-NNNN
      var proto = await gerarProtocoloGlobal(tx, now);

      data.updatedAt    = nowISO;
      data.reservations = stalls.filter(function(s) { return s.status === 'reserved'; })
        .map(function(s) { return {
          stallNumber:    s.number,
          holderName:     s.holderName,
          contactPhone:   s.contactPhone,
          requestedStalls:s.requestedStalls,
          status:         'Confirmada',
          reservedAt:     s.reservedAt,
          protocolo:      proto,
        }; });

      tx.set(ref(evId), data);
      resultado = { ok:true, data:data, protocolo:proto };
    });
    return resultado;
  }

  // ── Buscar por telefone ───────────────────────────────────────
  async function buscarReservasPorTelefone(telefone) {
    var tel  = telefone.replace(/\D/g, '');
    var snap = await db.collection('provas').get();
    var resultados = [];
    snap.forEach(function(doc) {
      var data  = doc.data();
      var baias = (data.stalls || []).filter(function(s) {
        return s.status === 'reserved' && s.contactPhone &&
               s.contactPhone.replace(/\D/g,'') === tel;
      });
      if (baias.length > 0) {
        // Enriquecer com protocolo das reservations
        baias = baias.map(function(b) {
          var res = (data.reservations || []).find(function(r){ return r.stallNumber === b.number; });
          return Object.assign({}, b, { protocolo: res ? res.protocolo : '' });
        });
        resultados.push({ evId:doc.id, evNome:data.eventName||'Evento', baias:baias });
      }
    });
    return resultados;
  }

  // ── Buscar por protocolo ──────────────────────────────────────
  async function buscarReservasPorProtocolo(protocolo) {
    var proto = protocolo.trim().toUpperCase();
    var snap  = await db.collection('provas').get();
    var resultados = [];
    snap.forEach(function(doc) {
      var data    = doc.data();
      var reservas = (data.reservations || []).filter(function(r) {
        return r.protocolo && r.protocolo.toUpperCase() === proto;
      });
      if (reservas.length > 0) {
        var nums  = reservas.map(function(r){ return r.stallNumber; });
        var baias = (data.stalls || []).filter(function(s){ return nums.indexOf(s.number) >= 0; })
          .map(function(b) { return Object.assign({}, b, { protocolo: proto }); });
        if (baias.length > 0) {
          resultados.push({ evId:doc.id, evNome:data.eventName||'Evento', baias:baias });
        }
      }
    });
    return resultados;
  }

  // ── W: Log de acessos ────────────────────────────────────────
  function registrarAcesso(evId, tipo) {
    try {
      db.collection('provas').doc(String(evId))
        .collection('acessos')
        .add({
          at:   new Date().toISOString(),
          ua:   navigator.userAgent.slice(0, 120),
          ts:   Date.now(),
          tipo: tipo || 'reserva',   // 'reserva' | 'visualizacao'
        })
        .catch(function(){});
    } catch(e) {}
  }

  // RISCO CORRIGIDO: getAcessos sem orderBy para evitar necessidade de índice
  // Ordenação feita no frontend
  async function getAcessos(evId) {
    try {
      var snap = await db.collection('provas').doc(String(evId))
        .collection('acessos').limit(200).get();
      var list = [];
      snap.forEach(function(d){ list.push(d.data()); });
      // Ordenar por ts decrescente no frontend
      list.sort(function(a,b){ return (b.ts||0) - (a.ts||0); });
      return list;
    } catch(e) {
      console.warn('[getAcessos]', e.message);
      return [];
    }
  }

  // ── Histórico por prova (documento único por prova) ─────────
  // Documento: provas/{id}/historico/log
  // Campo: acoes[] — array que cresce a cada ação
  function refHistorico(evId) {
    return db.collection('provas').doc(String(evId))
             .collection('historico').doc('log');
  }

  async function registrarAcao(evId, acao, baia, extra, usuario) {
    var entrada = {
      at:      new Date().toISOString(),
      ts:      Date.now(),
      usuario: usuario || 'organizador',
      acao:    acao,
      baia:    baia || null,
      extra:   extra || '',
    };
    try {
      // Usar update com arrayUnion para appender sem sobrescrever
      await refHistorico(evId).set(
        { acoes: firebase.firestore.FieldValue.arrayUnion(entrada) },
        { merge: true }
      );
    } catch(e) {
      console.warn('[registrarAcao]', e.message);
    }
  }

  async function getHistorico(evId) {
    try {
      var snap = await refHistorico(evId).get();
      if (!snap.exists) return [];
      var acoes = snap.data().acoes || [];
      acoes.sort(function(a,b){ return (b.ts||0) - (a.ts||0); });
      return acoes;
    } catch(e) {
      console.warn('[getHistorico]', e.message);
      return [];
    }
  }

  // Listener em tempo real para o histórico — múltiplos organizadores sincronizados
  function escutarHistorico(evId, cb) {
    return refHistorico(evId).onSnapshot(
      function(snap) {
        if (!snap.exists) { cb([]); return; }
        var acoes = (snap.data().acoes || []).slice();
        acoes.sort(function(a,b){ return (b.ts||0) - (a.ts||0); });
        cb(acoes);
      },
      function(err) {
        console.warn('[escutarHistorico]', err.message);
      }
    );
  }

  // ── Encerrar prova ────────────────────────────────────────────
  async function encerrarProva(evId, usuario) {
    // Idempotência: verificar se já está encerrada antes de agir
    var snap = await ref(evId).get();
    if (snap.exists && snap.data().status === 'encerrada') {
      return snap.data().encerradaAt; // já encerrada — retornar sem duplicar
    }
    var agora = new Date().toISOString();
    await ref(evId).update({
      status:       'encerrada',
      encerradaAt:  agora,
      encerradaPor: usuario || 'organizador',
    });
    await registrarAcao(evId, 'Prova encerrada', null, '', usuario);
    return agora;
  }

  // ── reservarAtomico: bloquear reserva em prova encerrada ──────
  // (verificação adicionada dentro da transaction existente)

  // Buscar estado atual de uma prova diretamente do Firestore (sem cache)
  async function getProvaSnapshot(evId) {
    try {
      var snap = await ref(evId).get();
      return snap.exists ? snap.data() : null;
    } catch(e) {
      console.warn('[getProvaSnapshot]', e.message);
      return null;
    }
  }

  // ── Funções de admin ─────────────────────────────────────────

  // Montar stalls a partir de blocos normalizados
  function montarStalls(blocos) {
    var stalls = [];
    blocos.forEach(function(b) {
      for (var i = 0; i < b.stalls; i++) {
        stalls.push({
          number: b.start + i, block: b.id, status: 'available',
          holderName: '', contactPhone: '', requestedStalls: 0,
          reservedAt: '', selectedAt: '', sessionId: '', obs: '',
        });
      }
    });
    return stalls;
  }

  // Normalizar blocos: todos iguais, resto no último
  function normalizarBlocos(totalBaias, numBlocos, labelPrefix) {
    labelPrefix = labelPrefix || 'Bloco';
    var base  = Math.floor(totalBaias / numBlocos);
    var resto = totalBaias - base * numBlocos;
    var blocos = [];
    var start  = 1;
    for (var i = 0; i < numBlocos; i++) {
      var n = (i < numBlocos - 1) ? base : base + resto;
      blocos.push({ id: i+1, label: labelPrefix + ' ' + (i+1), stalls: n, start: start });
      start += n;
    }
    return blocos;
  }

  // Criar nova prova no Firestore
  async function adminCriarProva(dados) {
    // dados: { name, date, endDate, loc, venue, icon, imgUrl, totalStalls, numBlocos,
    //          welcomeMsg, mapaLat, mapaLng, mapaZoom }
    var blocos  = normalizarBlocos(dados.totalStalls, dados.numBlocos);
    var stalls  = montarStalls(blocos);
    var agora   = new Date().toISOString();

    // Gerar ID único baseado em timestamp
    var docId = String(Date.now());

    var doc = {
      eventName:   dados.name,
      date:        dados.date        || '',
      endDate:     dados.endDate     || '',
      loc:         dados.loc         || '',
      venue:       dados.venue       || '',
      icon:        dados.icon        || '🐎',
      imgUrl:      dados.imgUrl      || '',
      welcomeMsg:  dados.welcomeMsg  || '',
      mapaLat:     dados.mapaLat     || -22.357261,
      mapaLng:     dados.mapaLng     || -51.574683,
      mapaZoom:    dados.mapaZoom    || 19,
      totalStalls: dados.totalStalls,
      numBlocos:   dados.numBlocos,
      blocos:      blocos,
      stalls:      stalls,
      reservations:[],
      createdAt:   agora,
      updatedAt:   agora,
    };

    await db.collection('provas').doc(docId).set(doc);
    return Object.assign({ id: docId }, doc);
  }

  // Editar metadados de uma prova (sem mexer nas reservas)
  async function adminEditarProva(evId, dados) {
    var snap = await ref(evId).get();
    if (!snap.exists) throw new Error('Prova não encontrada');
    var atual = snap.data();

    var update = {
      eventName:  dados.name        || atual.eventName,
      date:       dados.date        !== undefined ? dados.date        : atual.date,
      endDate:    dados.endDate     !== undefined ? dados.endDate     : atual.endDate,
      loc:        dados.loc         !== undefined ? dados.loc         : atual.loc,
      venue:      dados.venue       !== undefined ? dados.venue       : atual.venue,
      icon:       dados.icon        !== undefined ? dados.icon        : atual.icon,
      imgUrl:     dados.imgUrl      !== undefined ? dados.imgUrl      : atual.imgUrl,
      welcomeMsg: dados.welcomeMsg  !== undefined ? dados.welcomeMsg  : atual.welcomeMsg,
      mapaLat:    dados.mapaLat     !== undefined ? dados.mapaLat     : atual.mapaLat,
      mapaLng:    dados.mapaLng     !== undefined ? dados.mapaLng     : atual.mapaLng,
      mapaZoom:   dados.mapaZoom    !== undefined ? dados.mapaZoom    : atual.mapaZoom,
      updatedAt:  new Date().toISOString(),
    };

    // Se mudou total de baias ou blocos, recriar stalls (só se não tiver reservas)
    var temReservas = (atual.stalls || []).some(function(s){ return s.status === 'reserved'; });
    if (!temReservas && dados.totalStalls && dados.numBlocos) {
      var blocos = normalizarBlocos(dados.totalStalls, dados.numBlocos);
      update.blocos      = blocos;
      update.totalStalls = dados.totalStalls;
      update.numBlocos   = dados.numBlocos;
      update.stalls      = montarStalls(blocos);
      update.reservations= [];
    }

    await ref(evId).set(update, { merge: true });
    return update;
  }

  // Deletar prova
  async function adminDeletarProva(evId) {
    await ref(evId).delete();
    // Limpar sub-collections
    try { await db.collection('provas').doc(String(evId)).collection('historico').doc('log').delete(); } catch(e) {}
    try {
      var acessos = await db.collection('provas').doc(String(evId)).collection('acessos').limit(500).get();
      var batch = db.batch();
      acessos.forEach(function(d){ batch.delete(d.ref); });
      await batch.commit();
    } catch(e) {}
  }

  // Resetar reservas de uma prova
  async function adminResetarProva(evId) {
    var snap = await ref(evId).get();
    if (!snap.exists) throw new Error('Prova não encontrada');
    var data   = snap.data();
    var blocos = data.blocos || [];
    var stalls = montarStalls(blocos);
    await ref(evId).set({
      stalls:       stalls,
      reservations: [],
      updatedAt:    new Date().toISOString(),
      status:       firebase.firestore.FieldValue.delete(),
      encerradaAt:  firebase.firestore.FieldValue.delete(),
      encerradaPor: firebase.firestore.FieldValue.delete(),
    }, { merge: true });
  }

  // Buscar todas as provas com contagem de vagas (para o painel admin)
  async function adminGetProvas() {
    // Sem orderBy — evita erro de índice e compatibilidade com docs sem createdAt
    var snap = await db.collection('provas').get();
    var list = [];
    snap.forEach(function(d) {
      var data = d.data();
      var av   = (data.stalls || []).filter(function(s){ return s.status === 'available'; }).length;
      var res  = (data.stalls || []).filter(function(s){ return s.status === 'reserved'; }).length;
      list.push(Object.assign({ id: d.id, _av: av, _res: res }, data));
    });
    // Ordenar no frontend: mais recente primeiro
    list.sort(function(a, b) {
      return (b.createdAt || b.id || '').localeCompare(a.createdAt || a.id || '');
    });
    return list;
  }

  window.FB = {
    initProva, getProvas, salvar, escutar, reservarAtomico,
    buscarReservasPorTelefone, buscarReservasPorProtocolo,
    registrarAcesso, getAcessos,
    registrarAcao, getHistorico, escutarHistorico, encerrarProva, getProvaSnapshot,
    gerarProtocoloSimples,
    // Admin
    adminCriarProva, adminEditarProva, adminDeletarProva, adminResetarProva, adminGetProvas,
    normalizarBlocos, montarStalls,
  };
})();
