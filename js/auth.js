(function(global) {
  var KEY = 'baia_auth_session';
  var TTL = 8 * 60 * 60 * 1000; // 8 horas

  var CREDENTIALS = [
    { user: 'organizador', pass: 'baias2025', role: 'organizer' },
    { user: 'admin',       pass: 'admin123',  role: 'admin' },
  ];

  function validate(data) {
    if (!data || !data.user) return null;
    // Sessões sem timestamp (legadas) são inválidas
    if (!data.at) { clear(); return null; }
    // Sessões expiradas
    if ((Date.now() - data.at) > TTL) { clear(); return null; }
    return data;
  }

  function save(data) {
    var str = JSON.stringify(data);
    try { localStorage.setItem(KEY, str); }   catch(e) {}
    try { sessionStorage.setItem(KEY, str); } catch(e) {}
    try {
      var exp = new Date(Date.now() + TTL).toUTCString();
      document.cookie = KEY + '=' + encodeURIComponent(str) + ';expires=' + exp + ';path=/';
    } catch(e) {}
  }

  function load() {
    var data = null;
    // 1. localStorage
    try { var r = localStorage.getItem(KEY); if (r) data = JSON.parse(r); } catch(e) {}
    if (!data) {
      // 2. sessionStorage
      try { var r = sessionStorage.getItem(KEY); if (r) data = JSON.parse(r); } catch(e) {}
    }
    if (!data) {
      // 3. Cookie
      // CORREÇÃO: usar '\\s' dentro da string para que RegExp receba \s (whitespace) e não s literal
      try {
        var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + KEY + '=([^;]*)'));
        if (m) data = JSON.parse(decodeURIComponent(m[1]));
      } catch(e) {}
    }
    if (!data) {
      // 4. URL hash — fallback para file://
      try {
        var hash = window.location.hash.replace('#', '');
        if (hash.indexOf('auth=') === 0) {
          data = JSON.parse(atob(hash.replace('auth=', '')));
          if (validate(data)) save(data); // persiste se válido
        }
      } catch(e) {}
    }
    return validate(data);
  }

  function clear() {
    try { localStorage.removeItem(KEY); }  catch(e) {}
    try { sessionStorage.removeItem(KEY); } catch(e) {}
    try { document.cookie = KEY + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'; } catch(e) {}
  }

  function login(user, pass) {
    var found = null;
    for (var i = 0; i < CREDENTIALS.length; i++) {
      if (CREDENTIALS[i].user === user.trim().toLowerCase() && CREDENTIALS[i].pass === pass) {
        found = CREDENTIALS[i]; break;
      }
    }
    if (!found) return false;
    var data = { user: found.user, role: found.role, at: Date.now() };
    save(data);
    return data;
  }

  // Login assíncrono — valida contra Firebase (organizadores criados pelo admin)
  async function loginFirebase(user, pass) {
    // 1. Tentar credenciais fixas primeiro (admin/organizador padrão)
    var resultado = login(user, pass);
    if (resultado) return resultado;

    // 2. Tentar organizador do Firebase
    if (!window.FB || !window.FB.orgBuscar) return false;
    var org = await window.FB.orgBuscar(user.trim().toLowerCase());
    if (!org) return false;
    if (!org.ativo) return false;
    if (org.senha !== pass) return false;

    var data = {
      user:   org.usuario,
      role:   'organizer',
      nome:   org.nome,
      provas: org.provas || [],
      at:     Date.now(),
    };
    save(data);
    // Registrar acesso no log de atividade
    if (window.FB && window.FB.orgRegistrarAtividade) {
      window.FB.orgRegistrarAtividade(org.usuario, 'Login', navigator.platform || '');
    }
    return data;
  }

  function logout()          { clear(); }
  function isAuthenticated() { return !!load(); }
  function getSession()      { return load(); }

  function requireAuth(redirect) {
    if (!load()) {
      document.documentElement.style.display = 'none';
      window.location.replace(redirect || 'login.html');
    }
  }

  global.BAIA_AUTH = { login, loginFirebase, logout, isAuthenticated, getSession, requireAuth };
})(window);
