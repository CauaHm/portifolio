// Multiplayer via Supabase Realtime (sinalização + lista de salas + relé) e WebRTC (dados do jogo).
// Mesma interface de HostNet/ClientNet (net.js), então o resto do jogo não muda.
import { ONLINE } from './online-config.js';
import { randomCode } from './net.js';

const CH_PREFIX = 'pontozero-v1:';
const LOBBY = 'pontozero-v1:lobby';
const FAST = { snap: true, st: true };

let cfgPromise = null;

// Lê a configuração: /api/ponto-zero-config (variáveis da Vercel) e depois online-config.js
export function loadOnlineConfig() {
  if (cfgPromise) return cfgPromise;
  cfgPromise = (async () => {
    const cfg = { ...ONLINE };
    const q = new URLSearchParams(location.search);
    if (q.get('sburl') && q.get('sbkey')) {
      cfg.supabaseUrl = q.get('sburl');
      cfg.supabaseAnonKey = q.get('sbkey');
      return cfg;
    }
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3000);
        const r = await fetch('/api/ponto-zero-config', { signal: ctrl.signal, cache: 'no-store' });
        clearTimeout(t);
        if (r.ok) {
          const j = await r.json();
          if (j.supabaseUrl && j.supabaseAnonKey) {
            cfg.supabaseUrl = j.supabaseUrl;
            cfg.supabaseAnonKey = j.supabaseAnonKey;
          }
          if (Array.isArray(j.iceServers) && j.iceServers.length) cfg.iceServers = j.iceServers;
        }
      } catch (e) { /* sem API: segue com o arquivo */ }
    }
    return cfg;
  })();
  return cfgPromise;
}

export function supabaseReady(cfg) {
  return !!(cfg && cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase && window.RTCPeerConnection);
}

let sbClient = null;
function client(cfg) {
  if (sbClient) return sbClient;
  sbClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 60 } },
  });
  return sbClient;
}

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'c' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function subscribe(ch) {
  return new Promise((resolve, reject) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; reject(new Error('Tempo esgotado ao conectar no Supabase.')); } }, 12000);
    ch.subscribe((status, err) => {
      if (done) {
        if (status === 'CHANNEL_ERROR' || status === 'CLOSED') ch._pzOnDrop?.(status);
        return;
      }
      if (status === 'SUBSCRIBED') { done = true; clearTimeout(t); resolve(); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        done = true; clearTimeout(t);
        reject(new Error('Falha no Supabase Realtime (' + status + (err ? ': ' + (err.message || err) : '') + ').'));
      }
    });
  });
}

function bcast(ch, event, payload) {
  return ch.send({ type: 'broadcast', event, payload }).catch?.(() => {});
}

// ================= HOST =================
export class SupaHostNet {
  constructor(handlers, cfg) {
    this.h = handlers; // {onOpen(code), onJoin(id), onMessage(id,msg), onLeave(id), onError(err)}
    this.cfg = cfg;
    this.peers = new Map(); // cid -> peer
    this.byId = new Map(); // id -> peer
    this.nextId = 1;
    this.snapTick = 0;
    this.closed = false;
    this.lobbyInfo = null;
    this.forceRelay = new URLSearchParams(location.search).has('forcerelay'); // só para testes
  }

  async start(code = randomCode()) {
    try {
      const sb = client(this.cfg);
      this.code = code;
      const ch = sb.channel(CH_PREFIX + code, { config: { broadcast: { self: false, ack: false }, presence: { key: 'host' } } });
      this.ch = ch;
      ch.on('broadcast', { event: 'sig' }, ({ payload }) => this._sig(payload));
      ch.on('broadcast', { event: 'c2h' }, ({ payload }) => this._relayIn(payload));
      ch.on('presence', { event: 'leave' }, ({ key }) => {
        const p = this.peers.get(key);
        if (p) this._drop(p);
      });
      await subscribe(ch);
      // a sala já existe? (código repetido)
      await new Promise((r) => setTimeout(r, 700));
      const st = ch.presenceState();
      if (st.host && st.host.length > 0) {
        sb.removeChannel(ch);
        return this.start(randomCode());
      }
      await ch.track({ role: 'host', at: Date.now() });
      // lista pública de salas
      this.lobby = sb.channel(LOBBY, { config: { presence: { key: code } } });
      await subscribe(this.lobby).catch(() => { this.lobby = null; });
      if (this.lobbyInfo) this.announce(this.lobbyInfo);
      this.h.onOpen?.(code);
    } catch (e) {
      this.h.onError?.(e);
    }
  }

  // info pública da sala para o menu dos outros jogadores
  announce(info) {
    this.lobbyInfo = info;
    if (!this.lobby) return;
    const key = JSON.stringify(info);
    if (key === this._lastAnnounce) return;
    this._lastAnnounce = key;
    this.lobby.track({ ...info, code: this.code, at: Date.now() }).catch?.(() => {});
  }

  _sendSig(cid, data) {
    bcast(this.ch, 'sig', { ...data, to: cid, from: 'host' });
  }

  async _sig(p) {
    if (!p || p.to !== 'host' || !p.from) return;
    const cid = p.from;
    if (p.type === 'join') return this._newPeer(cid);
    const peer = this.peers.get(cid);
    if (!peer || !peer.pc) return;
    try {
      if (p.type === 'answer') await peer.pc.setRemoteDescription(p.sdp);
      else if (p.type === 'ice' && p.c) await peer.pc.addIceCandidate(p.c);
    } catch (e) { /* candidato atrasado: ignora */ }
  }

  async _newPeer(cid) {
    const old = this.peers.get(cid);
    if (old) {
      if (old.opened) return; // já conectado (join repetido)
      this._closePc(old);
    }
    const peer = { id: old ? old.id : 'p' + this.nextId++, cid, pc: null, rel: null, fast: null, mode: 'pending', opened: false };
    this.peers.set(cid, peer);
    let pc;
    try {
      pc = new RTCPeerConnection({ iceServers: this.cfg.iceServers });
    } catch (e) {
      return this._useRelay(peer);
    }
    peer.pc = pc;
    peer.rel = pc.createDataChannel('rel', { ordered: true });
    peer.fast = pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 });
    pc.onicecandidate = (e) => { if (e.candidate) this._sendSig(cid, { type: 'ice', c: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if ((s === 'failed' || s === 'closed') && peer.mode === 'rtc') this._drop(peer);
      if (s === 'failed' && peer.mode === 'pending') this._useRelay(peer);
    };
    peer.rel.onopen = () => this._open(peer, 'rtc');
    const onmsg = (e) => this._in(peer, e.data);
    peer.rel.onmessage = onmsg;
    peer.fast.onmessage = onmsg;
    peer.rel.onclose = () => { if (peer.mode === 'rtc') this._drop(peer); };
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this._sendSig(cid, { type: 'offer', sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
    } catch (e) {
      return this._useRelay(peer);
    }
    const wait = this.forceRelay ? 10 : this.cfg.directTimeout || 7000;
    peer.timer = setTimeout(() => { if (!peer.opened) this._useRelay(peer); }, wait);
  }

  _useRelay(peer) {
    if (peer.opened && peer.mode === 'rtc') return;
    this._closePc(peer);
    this._sendSig(peer.cid, { type: 'relay' });
    this._open(peer, 'relay');
  }

  _closePc(peer) {
    clearTimeout(peer.timer);
    try { peer.pc?.close(); } catch (e) { /* ignora */ }
    peer.pc = null;
  }

  _open(peer, mode) {
    if (peer.opened) return;
    clearTimeout(peer.timer);
    peer.opened = true;
    peer.mode = mode;
    this.byId.set(peer.id, peer);
    this._sendSig(peer.cid, { type: 'hello', mode });
    this.h.onJoin?.(peer.id, mode);
  }

  _in(peer, data) {
    if (!peer.opened) return;
    let msg;
    try { msg = typeof data === 'string' ? JSON.parse(data) : data; } catch (e) { return; }
    this.h.onMessage?.(peer.id, msg);
  }

  _relayIn(p) {
    if (!p || !p.from) return;
    const peer = this.peers.get(p.from);
    if (!peer || peer.mode !== 'relay' || !peer.opened) return;
    this._in(peer, p.d);
  }

  _drop(peer) {
    if (peer.dropped) return;
    peer.dropped = true;
    this._closePc(peer);
    this.peers.delete(peer.cid);
    this.byId.delete(peer.id);
    if (peer.opened) this.h.onLeave?.(peer.id);
  }

  _out(peer, str, t) {
    if (peer.mode === 'rtc') {
      const ch = FAST[t] && peer.fast && peer.fast.readyState === 'open' ? peer.fast : peer.rel;
      if (ch && ch.readyState === 'open') {
        try { ch.send(str); } catch (e) { /* buffer cheio */ }
      }
    } else if (peer.mode === 'relay') {
      bcast(this.ch, 'h2c', { to: peer.cid, d: str });
    }
  }

  send(id, msg) {
    const peer = this.byId.get(id);
    if (peer) this._out(peer, JSON.stringify(msg), msg.t);
  }

  broadcast(msg, str, exceptId) {
    let relay = false;
    let exceptCid = null;
    for (const peer of this.byId.values()) {
      if (peer.id === exceptId) { exceptCid = peer.cid; continue; }
      if (peer.mode === 'rtc') this._out(peer, str, msg.t);
      else relay = true;
    }
    if (relay) {
      // relé: snapshots a 10/s para poupar mensagens do Supabase
      if (msg.t === 'snap' && (this.snapTick++ & 1)) return;
      bcast(this.ch, 'h2c', { to: '*', ex: exceptCid, d: str });
    }
  }

  kick(id) {
    const peer = this.byId.get(id);
    if (peer) {
      this._sendSig(peer.cid, { type: 'kick' });
      setTimeout(() => this._drop(peer), 300);
    }
  }

  close() {
    this.closed = true;
    for (const p of [...this.peers.values()]) this._closePc(p);
    this.peers.clear();
    this.byId.clear();
    try { this.lobby?.untrack(); } catch (e) { /* ignora */ }
    try { if (this.ch) sbClient?.removeChannel(this.ch); } catch (e) { /* ignora */ }
    try { if (this.lobby) sbClient?.removeChannel(this.lobby); } catch (e) { /* ignora */ }
  }
}

// ================= CLIENTE =================
export class SupaClientNet {
  constructor(handlers, cfg) {
    this.h = handlers; // {onOpen(mode), onMessage(msg), onClose(reason), onError(err)}
    this.cfg = cfg;
    this.cid = uid();
    this.mode = 'pending';
    this.opened = false;
    this.stTick = 0;
    this.ended = false;
  }

  async connect(code) {
    code = code.toUpperCase();
    try {
      const sb = client(this.cfg);
      const ch = sb.channel(CH_PREFIX + code, { config: { broadcast: { self: false, ack: false }, presence: { key: this.cid } } });
      this.ch = ch;
      ch.on('broadcast', { event: 'sig' }, ({ payload }) => this._sig(payload));
      ch.on('broadcast', { event: 'h2c' }, ({ payload: p }) => {
        if (this.mode !== 'relay' || !p) return;
        if (p.to === this.cid || (p.to === '*' && p.ex !== this.cid)) this._in(p.d);
      });
      ch.on('presence', { event: 'leave' }, ({ key }) => {
        if (key === 'host') this._end('O host saiu da sala.');
      });
      ch._pzOnDrop = () => { if (this.mode === 'relay') this._end('A conexão com o Supabase caiu.'); };
      await subscribe(ch);
      await ch.track({ role: 'client', at: Date.now() });
      // espera o host aparecer na presença
      const t0 = performance.now();
      while (!ch.presenceState().host) {
        if (performance.now() - t0 > 5000) throw new Error('Sala não encontrada. Confira o código.');
        await new Promise((r) => setTimeout(r, 250));
      }
      this._join();
      // tenta de novo se o host não responder
      this.joinTimer = setInterval(() => {
        if (this.opened || this.ended) { clearInterval(this.joinTimer); return; }
        if (performance.now() - t0 > 25000) {
          clearInterval(this.joinTimer);
          this._fail(new Error('O host não respondeu. Tente de novo.'));
          return;
        }
        if (!this.pc) this._join();
      }, 3000);
    } catch (e) {
      this._fail(e);
    }
  }

  _join() {
    bcast(this.ch, 'sig', { type: 'join', to: 'host', from: this.cid });
  }

  _sendSig(data) {
    bcast(this.ch, 'sig', { ...data, to: 'host', from: this.cid });
  }

  async _sig(p) {
    if (!p || p.to !== this.cid) return;
    if (p.type === 'offer') {
      try { this.pc?.close(); } catch (e) { /* ignora */ }
      const pc = new RTCPeerConnection({ iceServers: this.cfg.iceServers });
      this.pc = pc;
      pc.onicecandidate = (e) => { if (e.candidate) this._sendSig({ type: 'ice', c: e.candidate.toJSON() }); };
      pc.ondatachannel = (e) => {
        const dc = e.channel;
        if (dc.label === 'rel') this.rel = dc; else this.fast = dc;
        dc.onmessage = (ev) => this._in(ev.data);
        dc.onopen = () => { if (dc.label === 'rel') this._open('rtc'); };
        dc.onclose = () => { if (dc.label === 'rel' && this.mode === 'rtc') this._end('A conexão com o host foi encerrada.'); };
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' && this.mode === 'rtc') this._end('A conexão com o host caiu.');
      };
      try {
        await pc.setRemoteDescription(p.sdp);
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        this._sendSig({ type: 'answer', sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
        for (const c of this.pendingIce || []) pc.addIceCandidate(c).catch(() => {});
        this.pendingIce = null;
      } catch (e) { /* o host vai cair para o relé */ }
    } else if (p.type === 'ice' && p.c) {
      if (this.pc && this.pc.remoteDescription) this.pc.addIceCandidate(p.c).catch(() => {});
      else (this.pendingIce = this.pendingIce || []).push(p.c);
    } else if (p.type === 'relay') {
      try { this.pc?.close(); } catch (e) { /* ignora */ }
      this.pc = null;
      this._open('relay');
    } else if (p.type === 'hello') {
      if (p.mode === 'relay' && this.mode !== 'relay') { this.pc?.close(); this.pc = null; this._open('relay'); }
    } else if (p.type === 'kick') {
      this._end('Você foi removido da sala pelo host.');
    }
  }

  _open(mode) {
    if (this.opened) return;
    this.opened = true;
    this.mode = mode;
    clearInterval(this.joinTimer);
    this.h.onOpen?.(mode);
  }

  _in(data) {
    let msg;
    try { msg = typeof data === 'string' ? JSON.parse(data) : data; } catch (e) { return; }
    this.h.onMessage?.(msg);
  }

  _fail(e) {
    if (this.ended) return;
    this.ended = true;
    this.h.onError?.(e);
    this.close();
  }

  _end(reason) {
    if (this.ended) return;
    this.ended = true;
    if (this.opened) this.h.onClose?.(reason);
    else this.h.onError?.(new Error(reason));
    this.close();
  }

  send(msg) {
    if (!this.opened) return;
    const str = JSON.stringify(msg);
    if (this.mode === 'rtc') {
      const ch = FAST[msg.t] && this.fast && this.fast.readyState === 'open' ? this.fast : this.rel;
      if (ch && ch.readyState === 'open') {
        try { ch.send(str); } catch (e) { /* ignora */ }
      }
    } else if (this.mode === 'relay') {
      if (msg.t === 'st' && (this.stTick++ & 1)) return; // 10/s no relé
      bcast(this.ch, 'c2h', { from: this.cid, d: str });
    }
  }

  close() {
    clearInterval(this.joinTimer);
    try { this.pc?.close(); } catch (e) { /* ignora */ }
    try { if (this.ch) { this.ch.untrack?.(); sbClient?.removeChannel(this.ch); } } catch (e) { /* ignora */ }
  }
}

// ================= LISTA DE SALAS =================
export class LobbyWatcher {
  constructor(cfg, onList) {
    this.cfg = cfg;
    this.onList = onList;
  }

  async start() {
    try {
      const sb = client(this.cfg);
      this.ch = sb.channel(LOBBY, { config: { presence: { key: 'viewer-' + uid() } } });
      this.ch.on('presence', { event: 'sync' }, () => this._emit());
      await subscribe(this.ch);
      this._emit();
    } catch (e) {
      this.onList?.(null, e);
    }
  }

  _emit() {
    const st = this.ch.presenceState();
    const rooms = [];
    for (const [key, metas] of Object.entries(st)) {
      if (key.startsWith('viewer-')) continue;
      const m = metas[metas.length - 1];
      if (m && m.code) rooms.push(m);
    }
    rooms.sort((a, b) => (b.players || 0) - (a.players || 0));
    this.onList?.(rooms);
  }

  stop() {
    try { if (this.ch) sbClient?.removeChannel(this.ch); } catch (e) { /* ignora */ }
    this.ch = null;
  }
}
