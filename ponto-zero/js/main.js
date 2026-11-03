// Fluxo de telas: menu, criar sala (host), entrar (cliente), treino offline, menu de pausa.
import { Server, normalizeSettings } from './server.js';
import { GameClient } from './client.js';
import { Hud } from './hud.js';
import { HostNet, ClientNet } from './net.js';
import { loadOnlineConfig, supabaseReady, SupaHostNet, SupaClientNet, LobbyWatcher } from './net-supabase.js';
import { MODES, DIFFICULTY, TEAMS } from './config.js';
import * as SFX from './audio.js';

const $ = (id) => document.getElementById(id);

const store = {
  get(k, def) {
    try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignora */ }
  },
};

const DEFAULT_OPTS = { sens: 1, fov: 74, volume: 0.7, crossColor: '#4dff7a', crossSize: 8, crossDot: false, invert: false };
let opts = { ...DEFAULT_OPTS, ...store.get('pz-opts', {}) };

let session = null; // {kind:'offline'|'host'|'client', server, client, net, code}
let onlineCfg = null;
let useSupa = false;
let lobby = null;
let createKind = 'offline';
let roomSettings = normalizeSettings(store.get('pz-room', { mode: 'elim', botFill: 4, botDiff: 'normal', roundsToWin: 8 }));

// ---------------- menu principal ----------------
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('show', s.id === id);
}

function playerName() {
  const n = $('nameInput').value.trim().slice(0, 16) || 'Jogador';
  store.set('pz-name', n);
  return n;
}

function initMenu() {
  $('nameInput').value = store.get('pz-name', '') || 'Jogador' + Math.floor(100 + Math.random() * 900);
  const q = new URLSearchParams(location.search);
  const sala = q.get('sala');
  if (sala) $('codeInput').value = sala.toUpperCase();
  if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) $('mobileWarn').style.display = '';

  $('btnOffline').onclick = () => openCreate('offline');
  $('btnHost').onclick = () => openCreate('host');
  $('btnJoin').onclick = () => joinRoom();
  $('codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
  $('codeInput').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  $('btnCreateBack').onclick = () => show('menu');
  $('btnCreateGo').onclick = () => startCreate();
  $('btnErrorBack').onclick = () => { show('menu'); };
  renderModeCards($('modeCards'), () => roomSettings.mode, (m) => { roomSettings = withMode(roomSettings, m); renderCreate(); });
  bindSettingsForm('create', () => roomSettings, (s) => { roomSettings = s; renderCreate(); });
  if (sala) $('codeInput').focus();
  initOnline();
}

async function initOnline() {
  onlineCfg = await loadOnlineConfig();
  useSupa = supabaseReady(onlineCfg);
  $('netInfo').innerHTML = useSupa
    ? 'Online via <b>Supabase</b> + WebRTC'
    : 'Online via PeerJS (configure o Supabase para a lista de salas)';
  if (useSupa) startLobby();
}

function startLobby() {
  if (!useSupa || lobby) return;
  $('roomListBox').style.display = '';
  $('roomList').innerHTML = '<div class="roomEmpty">Procurando salas…</div>';
  lobby = new LobbyWatcher(onlineCfg, (rooms, err) => {
    if (err || !rooms) {
      $('roomList').innerHTML = '<div class="roomEmpty">Não foi possível listar as salas.</div>';
      return;
    }
    $('roomCount').textContent = rooms.length ? `${rooms.length} aberta${rooms.length > 1 ? 's' : ''}` : '';
    if (!rooms.length) {
      $('roomList').innerHTML = '<div class="roomEmpty">Nenhuma sala aberta. Crie uma!</div>';
      return;
    }
    $('roomList').innerHTML = rooms.map((r) => `
      <button class="roomItem" data-code="${esc(r.code)}">
        <b>${esc(r.host || 'Sala')}</b><span class="rc">${esc(r.code)}</span>
        <small>${esc(MODES[r.mode]?.name || '')} · ${r.players || 1} jogador${(r.players || 1) > 1 ? 'es' : ''}${r.bots ? ` + ${r.bots} bots` : ''} · ${r.phase === 'warmup' ? 'aquecimento' : 'em jogo'}</small>
      </button>`).join('');
    $('roomList').querySelectorAll('.roomItem').forEach((b) => {
      b.onclick = () => { $('codeInput').value = b.dataset.code; joinRoom(); };
    });
  });
  lobby.start();
}

function stopLobby() {
  lobby?.stop();
  lobby = null;
}

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ao trocar de modo, ajusta o número de bots para algo que faça sentido
function withMode(s, mode) {
  const n = { ...s, mode };
  if (mode === 'ffa' && s.mode !== 'ffa') { n.botFill = Math.max(8, s.botFill); n.killLimit = 25; }
  if (mode !== 'ffa' && s.mode === 'ffa') { n.botFill = Math.min(5, s.botFill); n.killLimit = 50; }
  return normalizeSettings(n);
}

function renderModeCards(el, get, set) {
  el.innerHTML = Object.values(MODES).map((m) => `
    <button class="modeCard" data-mode="${m.id}">
      <span class="mcName">${m.name}</span>
      <span class="mcDesc">${m.desc}</span>
    </button>`).join('');
  el.querySelectorAll('.modeCard').forEach((b) => {
    b.onclick = () => set(b.dataset.mode);
  });
  const refresh = () => el.querySelectorAll('.modeCard').forEach((b) => b.classList.toggle('on', b.dataset.mode === get()));
  refresh();
  el._refresh = refresh;
}

// formulário de configurações (reutilizado no menu de pausa do host)
function bindSettingsForm(prefix, get, set) {
  const bots = $(prefix + 'Bots'), diff = $(prefix + 'Diff'), rounds = $(prefix + 'Rounds'), limit = $(prefix + 'Limit');
  diff.innerHTML = Object.entries(DIFFICULTY).map(([k, d]) => `<option value="${k}">${d.name}</option>`).join('');
  const update = () => {
    const s = { ...get() };
    s.botFill = Number(bots.value);
    s.botDiff = diff.value;
    s.roundsToWin = Number(rounds.value);
    s.killLimit = Number(limit.value);
    set(normalizeSettings(s));
  };
  bots.oninput = update;
  diff.onchange = update;
  rounds.onchange = update;
  limit.onchange = update;
}

function fillSettingsForm(prefix, s) {
  const bots = $(prefix + 'Bots');
  const ffa = s.mode === 'ffa';
  bots.max = ffa ? 12 : 6;
  bots.value = s.botFill;
  $(prefix + 'BotsLabel').textContent = ffa ? `Total de jogadores com bots: ${s.botFill}` : `Jogadores por time (com bots): ${s.botFill}`;
  $(prefix + 'Diff').value = s.botDiff;
  $(prefix + 'RoundsRow').style.display = s.mode === 'elim' ? '' : 'none';
  $(prefix + 'LimitRow').style.display = s.mode === 'elim' ? 'none' : '';
  $(prefix + 'Rounds').value = String(s.roundsToWin);
  const lim = $(prefix + 'Limit');
  const opts = ffa ? [10, 15, 25, 40] : [25, 50, 75, 100];
  lim.innerHTML = opts.map((v) => `<option value="${v}">${v} abates</option>`).join('');
  if (!opts.includes(s.killLimit)) s.killLimit = ffa ? 25 : 50;
  lim.value = String(s.killLimit);
}

function openCreate(kind) {
  createKind = kind;
  $('createTitle').textContent = kind === 'host' ? 'Criar sala online' : 'Treino offline com bots';
  $('btnCreateGo').textContent = kind === 'host' ? 'Criar sala' : 'Jogar';
  renderCreate();
  show('create');
}

function renderCreate() {
  const s = roomSettings;
  if (s.mode === 'ffa' && s.killLimit > 40) s.killLimit = 25;
  if (s.mode !== 'ffa' && s.killLimit < 25) s.killLimit = 50;
  $('modeCards')._refresh();
  fillSettingsForm('create', s);
  store.set('pz-room', s);
}

function errorScreen(text) {
  endSession();
  $('errorText').textContent = text;
  show('error');
}

// ---------------- sessão ----------------
function makeHud(getClient) {
  return new Hud((item) => getClient()?.buy(item));
}

function makeClient(send, isHost) {
  const hud = makeHud(() => session?.client);
  const client = new GameClient({
    canvas: $('game'),
    hud,
    send,
    settings: { ...opts, mode: roomSettings.mode },
    callbacks: {
      onWelcome: (m) => onWelcome(m),
      onPause: () => openPause(),
      onTeam: () => refreshPause(),
      onSettings: () => refreshPause(),
      onPhase: () => refreshPause(),
      onKicked: () => errorScreen('Você foi removido da sala pelo host.'),
      code: () => session?.code || '',
    },
  });
  client.applyOptions(opts);
  client.isHost = isHost;
  return client;
}

async function ensureOnline() {
  if (!onlineCfg) {
    onlineCfg = await loadOnlineConfig();
    useSupa = supabaseReady(onlineCfg);
  }
}

async function startCreate() {
  SFX.initAudio();
  const name = playerName();
  if (createKind !== 'offline') await ensureOnline();
  if (createKind === 'offline') startLocal(name, null);
  else {
    show('connecting');
    $('connectingText').textContent = 'Criando sala…';
    const Net = useSupa ? SupaHostNet : HostNet;
    const net = new Net({
      onOpen: (code) => startLocal(name, net, code),
      onJoin: (id) => session?.server?.join(id),
      onMessage: (id, msg) => session?.server?.receive(id, msg),
      onLeave: (id) => session?.server?.leave(id),
      onError: (err) => {
        if (!session || !session.client) errorScreen('Não foi possível criar a sala: ' + (err.type || err.message || err));
        else console.warn('peer error', err);
      },
    }, onlineCfg);
    try { net.start(); } catch (e) { errorScreen(e.message); }
    session = { kind: 'host', net, code: null };
  }
}

function startLocal(name, net, code) {
  const s = normalizeSettings({ ...roomSettings, offline: !net });
  const clone = (m) => JSON.parse(JSON.stringify(m));
  let client = null;
  const out = {
    send: (id, msg) => {
      if (id === 'host') client.receive(clone(msg));
      else if (net && id[0] === 'p') net.send(id, msg);
    },
    broadcast: (msg, except) => {
      const str = JSON.stringify(msg);
      if (net) net.broadcast(msg, str, except);
      if (except !== 'host') client.receive(JSON.parse(str));
    },
    kick: (id) => net?.kick(id),
  };
  client = makeClient((msg) => server.receive('host', clone(msg)), true);
  const server = new Server(s, out);
  session = { kind: net ? 'host' : 'offline', server, client, net, code };
  server.receive('host', { t: 'join', name });
  enterGame();
  startServerLoop();
  if (net) {
    // anuncia a sala na lista pública (Supabase)
    const announce = () => {
      if (!session || session.net !== net) return;
      let players = 0, bots = 0;
      for (const p of server.players.values()) { if (p.bot) bots++; else players++; }
      net.announce?.({ host: name, mode: server.settings.mode, players, bots, phase: server.phase === 'warmup' ? 'warmup' : 'live' });
    };
    announce();
    session.announceTimer = setInterval(announce, 4000);
  }
}

async function joinRoom() {
  SFX.initAudio();
  await ensureOnline();
  const code = $('codeInput').value.trim().toUpperCase();
  if (code.length < 4) {
    $('codeInput').focus();
    $('codeInput').classList.add('shake');
    setTimeout(() => $('codeInput').classList.remove('shake'), 400);
    return;
  }
  const name = playerName();
  show('connecting');
  $('connectingText').textContent = `Conectando à sala ${code}…`;
  let client = null;
  const Net = useSupa ? SupaClientNet : ClientNet;
  const net = new Net({
    onOpen: (mode) => {
      client = makeClient((msg) => net.send(msg), false);
      session.client = client;
      session.mode = mode;
      if (mode === 'relay') {
        client.interpDelay = 230;
        setTimeout(() => client.hud.toast('Conexão direta indisponível: usando o relé do Supabase'), 1500);
      }
      net.send({ t: 'join', name });
      enterGame();
      // vigia de conexão
      session.lastMsg = performance.now();
      session.watch = setInterval(() => {
        if (performance.now() - session.lastMsg > 8000) errorScreen('Sem resposta do host. A conexão caiu.');
      }, 2000);
    },
    onMessage: (msg) => {
      if (session) session.lastMsg = performance.now();
      client?.receive(msg);
    },
    onClose: (reason) => { if (session && session.client) errorScreen(reason); },
    onError: (err) => errorScreen(err.message || String(err)),
  }, onlineCfg);
  session = { kind: 'client', net, code, client: null };
  try { net.connect(code); } catch (e) { errorScreen(e.message); }
}

function enterGame() {
  stopLobby();
  show('gameScreen');
  session.client.start();
  history.replaceState(null, '', session.code ? `?sala=${session.code}` : location.pathname);
  if (session.code) $('pauseCode').textContent = session.code;
}

function startServerLoop() {
  let last = performance.now();
  const tick = () => {
    if (!session || !session.server) return;
    const now = performance.now();
    session.server.update(now - last);
    last = now;
  };
  const loop = () => {
    if (!session || !session.server) return;
    session.raf = requestAnimationFrame(loop);
    if (!document.hidden) tick();
  };
  session.raf = requestAnimationFrame(loop);
  // aba em segundo plano: um worker mantém o servidor rodando para os outros jogadores
  try {
    const blob = new Blob(['setInterval(() => postMessage(0), 33);'], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const w = new Worker(url);
    w.onmessage = () => {
      if (document.hidden && session?.server) {
        tick();
        session.client.pumpHidden?.();
      }
    };
    session.worker = w;
  } catch (e) { /* sem worker: o servidor só roda com a aba visível */ }
}

function endSession() {
  if (!session) return;
  try { session.client?.dispose(); } catch (e) { /* ignora */ }
  try { session.net?.close(); } catch (e) { /* ignora */ }
  if (session.raf) cancelAnimationFrame(session.raf);
  session.worker?.terminate();
  if (session.watch) clearInterval(session.watch);
  if (session.announceTimer) clearInterval(session.announceTimer);
  session = null;
  setTimeout(startLobby, 300);
  for (const id of ['pause', 'teamSelect']) $(id).classList.remove('show');
  history.replaceState(null, '', location.pathname);
}

// ---------------- seleção de time ----------------
function onWelcome(m) {
  if (MODES[m.settings.mode].teams) openTeamSelect();
  else session.client.hud.centerMsg('Todos por Um', 3, 'go', 'Clique na tela para jogar');
}

function openTeamSelect() {
  const c = session.client;
  c.ui.team = true;
  if (document.pointerLockElement) document.exitPointerLock();
  const counts = { atk: 0, def: 0 };
  for (const p of c.roster.values()) if (counts[p.t] != null) counts[p.t]++;
  $('teamAtkCount').textContent = counts.atk ? `${counts.atk} jogando` : '';
  $('teamDefCount').textContent = counts.def ? `${counts.def} jogando` : '';
  $('teamSelect').classList.add('show');
}

function pickTeam(team) {
  const c = session.client;
  c.send({ t: 'team', team });
  $('teamSelect').classList.remove('show');
  c.ui.team = false;
  $('pause').classList.remove('show');
  c.ui.pause = false;
  c.lock();
}

// ---------------- pausa ----------------
function openPause() {
  if (!session?.client) return;
  const c = session.client;
  c.ui.pause = true;
  refreshPause();
  $('pause').classList.add('show');
}

function closePause() {
  const c = session.client;
  $('pause').classList.remove('show');
  c.ui.pause = false;
  c.lock();
}

function refreshPause() {
  if (!session?.client) return;
  const c = session.client;
  const host = session.kind !== 'client';
  $('hostPanel').style.display = host ? '' : 'none';
  $('pauseRoom').style.display = session.code ? '' : 'none';
  $('pauseCode').textContent = session.code || '';
  const st = c.state;
  const s = host ? session.server.settings : st.settings;
  $('pauseMode').textContent = MODES[s?.mode || st.mode]?.name || '';
  $('btnTeam').style.display = MODES[st.mode]?.teams ? '' : 'none';
  if (host) {
    pendingSettings = pendingSettings || { ...session.server.settings };
    $('pauseModeCards')._refresh?.();
    fillSettingsForm('pause', pendingSettings);
    const warm = session.server.phase === 'warmup';
    $('btnStartMatch').textContent = warm ? 'Iniciar partida' : 'Reiniciar partida';
    $('warmupNote').style.display = warm ? '' : 'none';
  }
}

let pendingSettings = null;

function initPause() {
  $('btnResume').onclick = () => closePause();
  $('btnLeave').onclick = () => { endSession(); show('menu'); };
  $('btnTeam').onclick = () => { $('pause').classList.remove('show'); session.client.ui.pause = false; openTeamSelect(); };
  $('btnCopy').onclick = async () => {
    const url = `${location.origin}${location.pathname}?sala=${session.code}`;
    try { await navigator.clipboard.writeText(url); $('btnCopy').textContent = 'Link copiado!'; } catch (e) { $('btnCopy').textContent = url; }
    setTimeout(() => { $('btnCopy').textContent = 'Copiar link de convite'; }, 2500);
  };
  renderModeCards($('pauseModeCards'), () => (pendingSettings || session?.server?.settings || {}).mode, (m) => {
    pendingSettings = withMode(pendingSettings || session.server.settings, m);
    refreshPause();
  });
  bindSettingsForm('pause', () => pendingSettings || session.server.settings, (s) => { pendingSettings = s; refreshPause(); });
  $('btnStartMatch').onclick = () => {
    const srv = session.server;
    const s = pendingSettings || srv.settings;
    session.client.send({ t: 'cmd', c: 'settings', s, start: true });
    roomSettings = { ...s, offline: false };
    store.set('pz-room', roomSettings);
    pendingSettings = null;
    closePause();
  };
  $('btnApplyWarmup').onclick = () => {
    const s = pendingSettings || session.server.settings;
    session.client.send({ t: 'cmd', c: 'settings', s, start: false });
    pendingSettings = null;
    setTimeout(refreshPause, 100);
  };
  // opções
  const sens = $('optSens'), fov = $('optFov'), vol = $('optVol'), cc = $('optCross'), cs = $('optCrossSize'), cd = $('optDot');
  sens.value = opts.sens; fov.value = opts.fov; vol.value = opts.volume; cc.value = opts.crossColor; cs.value = opts.crossSize; cd.checked = opts.crossDot;
  const label = () => {
    $('optSensVal').textContent = Number(opts.sens).toFixed(2);
    $('optFovVal').textContent = opts.fov + '°';
    $('optVolVal').textContent = Math.round(opts.volume * 100) + '%';
  };
  const apply = () => {
    opts = { ...opts, sens: Number(sens.value), fov: Number(fov.value), volume: Number(vol.value), crossColor: cc.value, crossSize: Number(cs.value), crossDot: cd.checked };
    store.set('pz-opts', opts);
    label();
    if (session?.client) session.client.applyOptions(opts);
  };
  for (const el of [sens, fov, vol, cc, cs]) el.oninput = apply;
  cd.onchange = apply;
  label();
  // seleção de time
  for (const [id, team] of [['teamAtk', 'atk'], ['teamDef', 'def'], ['teamAuto', 'auto'], ['teamSpec', 'spec']]) {
    $(id).onclick = () => pickTeam(team);
  }
  $('teamAtk').querySelector('.tn').textContent = TEAMS.atk.name;
  $('teamDef').querySelector('.tn').textContent = TEAMS.def.name;
  document.addEventListener('keydown', (e) => {
    if (!session?.client) return;
    if (e.code === 'KeyM' && !session.client.ui.chat && !session.client.ui.pause && MODES[session.client.state.mode]?.teams) {
      openTeamSelect();
    }
  });
}

initMenu();
initPause();
if (new URLSearchParams(location.search).has('debug')) window.__pz = () => session;
show('menu');
