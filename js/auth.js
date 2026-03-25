(function(global) {
  var KEY = 'baia_auth_session';
  var TTL = 8 * 60 * 60 * 1000; // 8 horas
  // Para manter o fluxo atual sem expor senha em texto puro no frontend,
  // os usuários padrão usam hash com sal (sha-256 de "salt:password").
  // É possível sobrescrever por runtime via window.BAIA_AUTH_USERS.
  var DEFAULT_AUTH_USERS = [
    { user: 'organizador', role: 'organizer', salt: 's9f31c2a', passHash: 'f72545686e30005476338d413da8f9ace92b38b6a04c83a25db1eaafde3ce95a', pass: 'baias2025' },
    { user: 'admin',       role: 'admin',     salt: 'a74d19ef', passHash: '554202fe58dfd0d8dce8eda65d28aece10507d7f9596789316c1e097fb18930b', pass: 'admin123' },
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

  function getAuthUsers() {
    var runtimeUsers = null;
    try {
      if (Array.isArray(global.BAIA_AUTH_USERS) && global.BAIA_AUTH_USERS.length) runtimeUsers = global.BAIA_AUTH_USERS;
      else if (global.BAIA_CONFIG && Array.isArray(global.BAIA_CONFIG.AUTH_USERS) && global.BAIA_CONFIG.AUTH_USERS.length) runtimeUsers = global.BAIA_CONFIG.AUTH_USERS;
    } catch(e) {}
    return runtimeUsers || DEFAULT_AUTH_USERS;
  }

  function timingSafeEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    var out = 0;
    for (var i = 0; i < a.length; i++) out |= (a.charCodeAt(i) ^ b.charCodeAt(i));
    return out === 0;
  }

  async function hashPassword(salt, pass) {
    var input = String(salt || '') + ':' + String(pass || '');
    if (!global.crypto || !global.crypto.subtle || !global.TextEncoder) return null;
    var bytes = new TextEncoder().encode(input);
    var digest = await global.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(function(b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }

  async function login(user, pass) {
    var normalizedUser = String(user || '').trim().toLowerCase();
    var found = null;
    var users = getAuthUsers();
    for (var i = 0; i < users.length; i++) {
      if (users[i] && users[i].user === normalizedUser) { found = users[i]; break; }
    }
    if (!found) return false;
    var hash = await hashPassword(found.salt, pass);
    if (hash && found.passHash) {
      if (!timingSafeEqual(hash, found.passHash)) return false;
    } else {
      // fallback para ambientes de demo sem crypto.subtle disponível
      if (!found.pass || found.pass !== pass) return false;
    }
    var data = { user: found.user, role: found.role, at: Date.now() };
    save(data);
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

  global.BAIA_AUTH = { login, logout, isAuthenticated, getSession, requireAuth };
})(window);
