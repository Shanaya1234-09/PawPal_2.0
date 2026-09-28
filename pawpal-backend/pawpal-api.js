/* Drop-in client for the PawPal API. ES5, no modules, works from file://
   <script src="pawpal-api.js"></script>, then:
     PawPalAPI.login('aarav@pawpal.in','pawpal123').then(function(){ return PawPalAPI.pets(); })
   Every method returns a Promise; failures reject with an Error whose message is the server's. */
(function (w) {
  var BASE = w.PAWPAL_API || 'http://localhost:3000/api';
  var token = null;
  try { token = w.localStorage.getItem('pawpal_token'); } catch (e) {}

  function req(method, path, body) {
    return fetch(BASE + path, {
      method: method,
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (r.status === 204) return null;
      return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Request failed'); return j; });
    });
  }
  function keep(s) { token = s.token; try { w.localStorage.setItem('pawpal_token', token); } catch (e) {} return s.user; }
  var P = function (id, tail) { return '/pets/' + id + (tail || ''); };

  w.PawPalAPI = {
    register: function (b) { return req('POST', '/auth/register', b).then(keep); },
    login: function (email, password) { return req('POST', '/auth/login', { email: email, password: password }).then(keep); },
    logout: function () { token = null; try { w.localStorage.removeItem('pawpal_token'); } catch (e) {} },
    forgot: function (email) { return req('POST', '/auth/forgot', { email: email }); },
    me: function () { return req('GET', '/me'); },
    updateMe: function (b) { return req('PATCH', '/me', b); },
    pets: function () { return req('GET', '/pets'); },
    addPet: function (b) { return req('POST', '/pets', b); },
    updatePet: function (id, b) { return req('PATCH', P(id), b); },
    thread: function (id, day) { return req('GET', P(id, '/thread' + (day ? '?date=' + day : ''))); },
    addEntry: function (id, b) { return req('POST', P(id, '/thread'), b); },
    doneEntry: function (id, eid, done) { return req('PATCH', P(id, '/thread/' + eid), { done: done }); },
    vaccinations: function (id) { return req('GET', P(id, '/vaccinations')); },
    bookVaccination: function (id, vid, slot, clinic) { return req('POST', P(id, '/vaccinations/' + vid + '/book'), { slot: slot, clinic: clinic }); },
    records: function (id) { return req('GET', P(id, '/records')); },
    addRecord: function (id, b) { return req('POST', P(id, '/records'), b); },
    weights: function (id) { return req('GET', P(id, '/weights')); },
    logWeight: function (id, kg) { return req('POST', P(id, '/weights'), { kg: kg }); },
    feeding: function (id) { return req('GET', P(id, '/feeding')); },
    setPortion: function (id, grams) { return req('PATCH', P(id, '/feeding'), { grams: grams }); },
    spending: function (id, month) { return req('GET', P(id, '/expenses' + (month ? '?month=' + month : ''))); },
    addExpense: function (id, category, amount) { return req('POST', P(id, '/expenses'), { category: category, amount: amount }); },
    poster: function (id) { return req('GET', P(id, '/poster')); },
    sharePoster: function (id, groups) { return req('POST', P(id, '/poster/share'), { groups: groups }); },
    community: function () { return req('GET', '/community'); },
    ask: function (body) { return req('POST', '/community', { body: body }); },
    answer: function (postId, body) { return req('POST', '/community/' + postId + '/answers', { body: body }); },
    assistant: function (id, question) { return req('POST', P(id, '/assistant'), { question: question }); },
    emergency: function (id, lat, lng) { return req('GET', P(id, '/emergency' + (lat != null ? '?lat=' + lat + '&lng=' + lng : ''))); },
    startCall: function (id, contact) { return req('POST', P(id, '/emergency/calls'), { contact: contact, shareRecords: true }); },
    endCall: function (id, cid) { return req('PATCH', P(id, '/emergency/calls/' + cid), {}); },
    reminders: function (id) { return req('GET', P(id, '/reminders')); },
    setReminders: function (id, b) { return req('PUT', P(id, '/reminders'), b); },
    contacts: function () { return req('GET', '/contacts'); },
    invite: function (id) { return req('POST', P(id, '/family/invite'), {}); }
  };
})(window);
