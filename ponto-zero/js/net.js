// Rede P2P com PeerJS (WebRTC). O host é autoritativo: roda o Server e repassa estados.
// Funciona em hospedagem estática (Vercel) sem backend próprio.

const PREFIX = 'pontozero-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode(n = 5) {
  let s = '';
  for (let i = 0; i < n; i++) s += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
  return s;
}

function peerOptions() {
  // Permite apontar para um PeerServer próprio: ?peerhost=meu.servidor&peerport=443&peerpath=/
  const q = new URLSearchParams(location.search);
  const opts = { debug: Number(q.get('peerdebug') || 0) };
  if (q.get('peerhost')) {
    opts.host = q.get('peerhost');
    opts.port = Number(q.get('peerport') || 443);
    opts.path = q.get('peerpath') || '/';
    opts.secure = q.get('peersecure') ? q.get('peersecure') === '1' : opts.port === 443;
  }
  return opts;
}

function requirePeer() {
  if (!window.Peer) throw new Error('PeerJS não carregou. Verifique sua conexão.');
  return window.Peer;
}

// ---------- Host ----------
export class HostNet {
  constructor(handlers) {
    this.h = handlers; // {onOpen(code), onJoin(id), onMessage(id,msg), onLeave(id), onError(err)}
    this.conns = new Map();
    this.peer = null;
    this.code = null;
    this.nextId = 1;
    this.tries = 0;
  }

  start(code = randomCode()) {
    const Peer = requirePeer();
    this.code = code;
    this.peer = new Peer(PREFIX + code, peerOptions());
    this.peer.on('open', () => this.h.onOpen?.(code));
    this.peer.on('connection', (conn) => this._accept(conn));
    this.peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && this.tries++ < 5) {
        this.peer.destroy();
        this.start(randomCode());
        return;
      }
      if (err.type === 'peer-unavailable') return;
      this.h.onError?.(err);
    });
    this.peer.on('disconnected', () => {
      // perdeu o servidor de sinalização; conexões já abertas continuam
      try { this.peer.reconnect(); } catch (e) { /* ignora */ }
    });
  }

  _accept(conn) {
    const id = 'p' + this.nextId++;
    conn.on('open', () => {
      this.conns.set(id, conn);
      this.h.onJoin?.(id);
    });
    conn.on('data', (data) => {
      if (!this.conns.has(id)) return;
      let msg = data;
      if (typeof data === 'string') {
        try { msg = JSON.parse(data); } catch (e) { return; }
      }
      this.h.onMessage?.(id, msg);
    });
    const leave = () => {
      if (!this.conns.has(id)) return;
      this.conns.delete(id);
      this.h.onLeave?.(id);
    };
    conn.on('close', leave);
    conn.on('error', leave);
    conn.peerConnection?.addEventListener?.('iceconnectionstatechange', () => {
      const st = conn.peerConnection.iceConnectionState;
      if (st === 'failed' || st === 'closed') leave();
    });
  }

  send(id, msg) {
    const c = this.conns.get(id);
    if (c && c.open) {
      try { c.send(JSON.stringify(msg)); } catch (e) { /* ignora */ }
    }
  }

  broadcast(msg, str, exceptId) {
    this.broadcastRaw(str, exceptId);
  }

  announce() { /* PeerJS não tem lista de salas */ }

  broadcastRaw(str, exceptId) {
    for (const [id, c] of this.conns) {
      if (id === exceptId || !c.open) continue;
      try { c.send(str); } catch (e) { /* ignora */ }
    }
  }

  kick(id) {
    const c = this.conns.get(id);
    if (c) c.close();
  }

  close() {
    for (const c of this.conns.values()) c.close();
    this.conns.clear();
    this.peer?.destroy();
  }
}

// ---------- Cliente ----------
export class ClientNet {
  constructor(handlers) {
    this.h = handlers; // {onOpen(), onMessage(msg), onClose(reason), onError(err)}
    this.peer = null;
    this.conn = null;
    this.opened = false;
  }

  connect(code) {
    const Peer = requirePeer();
    this.peer = new Peer(undefined, peerOptions());
    const timeout = setTimeout(() => {
      if (!this.opened) {
        this.h.onError?.(new Error('Tempo esgotado. Confira o código da sala.'));
        this.close();
      }
    }, 15000);
    this.peer.on('open', () => {
      this.conn = this.peer.connect(PREFIX + code.toUpperCase(), { reliable: true, serialization: 'raw' });
      this.conn.on('open', () => {
        this.opened = true;
        clearTimeout(timeout);
        this.h.onOpen?.('rtc');
      });
      this.conn.on('data', (data) => {
        let msg = data;
        if (typeof data === 'string') {
          try { msg = JSON.parse(data); } catch (e) { return; }
        }
        this.h.onMessage?.(msg);
      });
      this.conn.on('close', () => this.h.onClose?.('A conexão com o host foi encerrada.'));
      this.conn.on('error', () => this.h.onClose?.('Erro na conexão com o host.'));
    });
    this.peer.on('error', (err) => {
      clearTimeout(timeout);
      if (err.type === 'peer-unavailable') this.h.onError?.(new Error('Sala não encontrada. Confira o código.'));
      else if (!this.opened) this.h.onError?.(new Error('Não foi possível conectar: ' + (err.type || err.message)));
    });
  }

  send(msg) {
    if (this.conn && this.conn.open) {
      try { this.conn.send(JSON.stringify(msg)); } catch (e) { /* ignora */ }
    }
  }

  close() {
    try { this.conn?.close(); } catch (e) { /* ignora */ }
    try { this.peer?.destroy(); } catch (e) { /* ignora */ }
  }
}
