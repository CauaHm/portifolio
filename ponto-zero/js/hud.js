// HUD em DOM: vida, munição, placar, killfeed, radar, menus de compra e placar (Tab).
import { WEAPONS, NADES, GEAR, BUY_MENU, TEAMS, itemInfo } from './config.js';
import { CELL, GW, GH, OX, OZ } from './map.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtTime(s) {
  s = Math.ceil(s);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export class Hud {
  constructor(onBuy) {
    this.onBuy = onBuy;
    this.el = {
      root: $('hud'), hp: $('hp'), armor: $('armor'), armorIcon: $('armorIcon'), money: $('money'), moneyBox: $('moneyBox'),
      weapon: $('weaponName'), mag: $('mag'), res: $('reserve'), ammoBox: $('ammoBox'), slots: $('slots'),
      timer: $('timer'), scoreL: $('scoreL'), scoreR: $('scoreR'), round: $('roundInfo'), bombIcon: $('bombIcon'),
      feed: $('killfeed'), center: $('centerMsg'), centerSub: $('centerSub'), progress: $('progress'), progressBar: $('progressBar'),
      progressLabel: $('progressLabel'), hitmarker: $('hitmarker'), cross: $('crosshair'), scope: $('scope'), flash: $('flashOverlay'),
      dmg: $('dmgIndicators'), vignette: $('vignette'), chatLog: $('chatLog'), chatInput: $('chatInput'), chatBox: $('chatBox'),
      chatLabel: $('chatLabel'), score: $('scoreboard'), buy: $('buyMenu'), radar: $('radar'), spec: $('spectate'),
      toast: $('toast'), hint: $('hint'), buyHint: $('buyHint'), kitIcon: $('kitIcon'), killIcon: $('killIcon'), ping: $('pingInfo'),
    };
    this.radarCtx = this.el.radar.getContext('2d');
    this.radarBg = null;
    this.centerUntil = 0;
    this.toastUntil = 0;
    this.lastFrame = {};
    this.sb = null;
    this.buyItems = [];
  }

  setCrosshairStyle(o) {
    const c = this.el.cross;
    c.style.setProperty('--ch-color', o.crossColor || '#4dff7a');
    c.style.setProperty('--ch-size', (o.crossSize || 8) + 'px');
    c.classList.toggle('dot', !!o.crossDot);
  }

  update(s) {
    const e = this.el;
    const set = (k, v, fn) => { if (this.lastFrame[k] !== v) { this.lastFrame[k] = v; fn(v); } };
    e.root.classList.toggle('dead', !s.alive);
    set('hp', s.alive ? s.hp : 0, (v) => {
      e.hp.textContent = Math.max(0, v);
      e.hp.parentElement.classList.toggle('low', v > 0 && v <= 25);
      e.vignette.style.opacity = v > 0 && v <= 30 ? String(0.25 + (30 - v) / 60) : '0';
    });
    set('armor', s.armor + (s.helmet ? 'h' : ''), () => {
      e.armor.textContent = s.armor;
      e.armorIcon.textContent = s.helmet ? '⛑' : '🛡';
    });
    set('money', s.econ ? s.money : -1, (v) => {
      e.moneyBox.style.display = v < 0 ? 'none' : '';
      e.money.textContent = '$' + v;
    });
    set('kit', s.kit, (v) => { e.kitIcon.style.display = v ? '' : 'none'; });
    set('weapon', s.weapon, (v) => { e.weapon.textContent = v; });
    const ammoKey = s.ammo ? `${s.ammo.mag}/${s.ammo.res}/${s.ammo.reloading}` : '-';
    set('ammo', ammoKey, () => {
      if (!s.ammo) { e.ammoBox.classList.add('none'); return; }
      e.ammoBox.classList.remove('none');
      e.mag.textContent = s.ammo.reloading ? '…' : s.ammo.mag;
      e.res.textContent = s.ammo.res;
      e.mag.classList.toggle('low', s.ammo.mag <= 5);
    });
    set('slots', s.slot + s.nades.join(',') + s.hasBomb, () => {
      const parts = [];
      parts.push(`<span class="${s.slot === 'primary' ? 'on' : ''}">1</span>`);
      parts.push(`<span class="${s.slot === 'secondary' ? 'on' : ''}">2</span>`);
      parts.push(`<span class="${s.slot === 'knife' ? 'on' : ''}">3</span>`);
      if (s.nades.length) parts.push(`<span class="${s.slot === 'nade' ? 'on' : ''}">4 ${s.nades.map((n) => NADES[n].short).join(' · ')}</span>`);
      if (s.hasBomb) parts.push(`<span class="bomb ${s.slot === 'bomb' ? 'on' : ''}">5 Bomba</span>`);
      e.slots.innerHTML = parts.join('');
    });
    set('bombIcon', s.hasBomb, (v) => { e.bombIcon.style.display = v ? '' : 'none'; });
    // placar topo
    let timerText = '', timerClass = '';
    if (s.bombRem != null) { timerText = '💣 ' + Math.ceil(s.bombRem); timerClass = 'bomb'; }
    else if (s.phase === 'warmup') timerText = 'AQUECIMENTO';
    else if (s.timer != null) { timerText = fmtTime(s.timer); if (s.phase === 'freeze') timerClass = 'freeze'; }
    set('timer', timerText + timerClass, () => { e.timer.textContent = timerText; e.timer.className = timerClass; });
    let L = '', R = '', info = '';
    if (s.mode === 'elim') {
      L = s.score.atk; R = s.score.def;
      info = s.phase === 'warmup' ? 'Mata-mata' : `Rodada ${s.round} · primeiro a ${s.roundsToWin}`;
    } else if (s.mode === 'tdm') {
      L = s.kills.atk; R = s.kills.def;
      info = `Team Deathmatch · ${s.limit} abates`;
    } else {
      L = s.myK; R = s.leader ? s.leader.k : 0;
      info = `Todos por Um · ${s.limit} abates${s.leader ? ' · líder: ' + s.leader.n : ''}`;
    }
    set('score', `${L}|${R}|${info}|${s.mode}`, () => {
      e.scoreL.textContent = L;
      e.scoreR.textContent = R;
      e.round.textContent = info;
      e.scoreL.parentElement.classList.toggle('ffa', s.mode === 'ffa');
    });
    // mira dinâmica
    const gap = Math.min(60, 4 + s.inaccuracy * 700);
    set('gap', Math.round(gap), (v) => e.cross.style.setProperty('--ch-gap', v + 'px'));
    set('scope', !!s.scope, (v) => {
      e.scope.style.display = v ? '' : 'none';
      e.cross.style.display = v ? 'none' : '';
    });
    set('crossVis', s.alive, (v) => { e.cross.style.visibility = v ? '' : 'hidden'; });
    // dicas
    set('hint', s.hint, (v) => { e.hint.textContent = v; e.hint.style.display = v ? '' : 'none'; });
    const bh = s.alive && s.canBuy ? (s.econ ? `Compra: B (${Math.ceil(s.buyRem)} s)` : 'Compra: B') : '';
    set('buyHint', bh, (v) => { e.buyHint.textContent = v; e.buyHint.style.display = v ? '' : 'none'; });
    set('ping', s.ping, (v) => { e.ping.textContent = v ? `${v} ms` : ''; });
    // mensagens temporárias
    const now = performance.now();
    if (this.centerUntil && now > this.centerUntil) { e.center.classList.remove('show'); this.centerUntil = 0; }
    if (this.toastUntil && now > this.toastUntil) { e.toast.classList.remove('show'); this.toastUntil = 0; }
  }

  centerMsg(text, dur = 3, cls = '', sub = '') {
    const e = this.el;
    e.center.firstElementChild.textContent = text;
    e.centerSub.textContent = sub;
    e.center.className = 'show ' + (cls || '');
    this.centerUntil = performance.now() + dur * 1000;
  }

  toast(text) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this.toastUntil = performance.now() + 2000;
  }

  progress(k, label) {
    const e = this.el;
    if (k == null) { e.progress.style.display = 'none'; return; }
    e.progress.style.display = '';
    e.progressBar.style.width = Math.min(100, k * 100) + '%';
    e.progressLabel.textContent = label;
  }

  hitmarker(head) {
    const h = this.el.hitmarker;
    h.classList.remove('show', 'head');
    void h.offsetWidth;
    h.classList.add('show');
    if (head) h.classList.add('head');
  }

  killIcon(head) {
    const k = this.el.killIcon;
    k.textContent = head ? '✚ HS' : '✚';
    k.classList.remove('show');
    void k.offsetWidth;
    k.classList.add('show');
  }

  damage(angle, dmg) {
    if (angle == null) return;
    const d = document.createElement('div');
    d.className = 'dmg';
    d.style.transform = `translate(-50%,-50%) rotate(${angle}rad)`;
    d.style.opacity = String(Math.min(1, 0.4 + dmg / 60));
    this.el.dmg.appendChild(d);
    setTimeout(() => d.remove(), 1200);
  }

  flash(k) {
    const v = k > 0 ? String(k) : '0';
    if (this.lastFrame.flash !== v) {
      this.lastFrame.flash = v;
      this.el.flash.style.opacity = v;
    }
  }

  killfeed({ k, kt, v, vt, w, hs, a, mine }) {
    const row = document.createElement('div');
    row.className = 'kf' + (mine ? ' mine' : '');
    const wname = WEAPONS[w]?.short || NADES[w]?.short || (w === 'bomb' ? 'Bomba' : w);
    const col = (t) => TEAMS[t]?.color || '#ddd';
    row.innerHTML = (k ? `<b style="color:${col(kt)}">${esc(k)}</b>` : '') +
      (a ? ` <span class="assist">+ ${esc(a)}</span>` : '') +
      ` <span class="w">${esc(wname)}${hs ? ' <i>✚</i>' : ''}</span> ` +
      `<b style="color:${col(vt)}">${esc(v)}</b>`;
    this.el.feed.prepend(row);
    while (this.el.feed.children.length > 6) this.el.feed.lastChild.remove();
    setTimeout(() => row.classList.add('fade'), 6000);
    setTimeout(() => row.remove(), 7000);
  }

  feedInfo(text) {
    const row = document.createElement('div');
    row.className = 'kf info';
    row.textContent = text;
    this.el.feed.prepend(row);
    setTimeout(() => row.remove(), 5000);
  }

  chat(m, color) {
    const row = document.createElement('div');
    row.className = 'chatline';
    row.innerHTML = `${m.dead ? '<span class="dead">*MORTO*</span> ' : ''}${m.tm ? '<span class="tm">(time)</span> ' : ''}<b style="color:${color || '#ddd'}">${esc(m.n)}</b>: ${esc(m.text)}`;
    this.el.chatLog.appendChild(row);
    while (this.el.chatLog.children.length > 8) this.el.chatLog.firstChild.remove();
    setTimeout(() => row.classList.add('fade'), 10000);
  }

  openChat(team, onSubmit) {
    const e = this.el;
    e.chatBox.style.display = '';
    e.chatLabel.textContent = team ? 'Time:' : 'Todos:';
    e.chatInput.value = '';
    e.chatLog.classList.add('open');
    setTimeout(() => e.chatInput.focus(), 0);
    e.chatInput.onkeydown = (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') onSubmit(e.chatInput.value.trim());
      if (ev.key === 'Escape') onSubmit('');
    };
  }

  closeChat() {
    this.el.chatBox.style.display = 'none';
    this.el.chatInput.blur();
    this.el.chatLog.classList.remove('open');
  }

  spectating(name, color, canCycle) {
    const key = `${name}|${canCycle}`;
    if (this.lastFrame.spec === key) return;
    this.lastFrame.spec = key;
    const e = this.el.spec;
    if (!name) { e.style.display = 'none'; return; }
    e.style.display = '';
    e.innerHTML = `Assistindo: <b style="color:${color}">${esc(name)}</b>${canCycle ? '<small>Clique para trocar</small>' : ''}`;
  }

  // ---------------- placar (Tab) ----------------
  updateScoreboard(d) {
    this.sb = d;
    if (this.el.score.classList.contains('show')) this.renderScoreboard();
  }

  showScoreboard(show) {
    this.el.score.classList.toggle('show', show);
    if (show) this.renderScoreboard();
  }

  renderScoreboard() {
    const d = this.sb;
    if (!d) return;
    const row = (p) => `<tr class="${p.i === d.me ? 'me' : ''} ${p.al ? '' : 'deadrow'}">
      <td class="name">${p.b ? '<span class="botTag">BOT</span>' : ''}${esc(p.n)}${p.bo && (d.myTeam === 'atk' || d.myTeam === 'spec') ? ' 💣' : ''}</td>
      ${d.mode === 'elim' ? `<td>${p.t === d.myTeam || d.myTeam === 'spec' ? '$' + p.m : ''}</td>` : ''}
      <td>${p.k}</td><td>${p.a}</td><td>${p.d}</td><td>${p.sc}</td><td>${p.b ? 'BOT' : p.pi ? p.pi : '—'}</td></tr>`;
    const head = `<tr><th class="name">Jogador</th>${d.mode === 'elim' ? '<th>$</th>' : ''}<th>A</th><th>As</th><th>M</th><th>Pts</th><th>Ping</th></tr>`;
    const sortFn = (a, b) => b.sc - a.sc || b.k - a.k;
    let html = '';
    if (d.mode === 'ffa') {
      const list = d.players.filter((p) => p.t === 'ffa').sort((a, b) => b.k - a.k || a.d - b.d);
      html += `<div class="sbTeam ffa"><h3>Todos por Um</h3><table>${head}${list.map(row).join('')}</table></div>`;
    } else {
      for (const t of ['atk', 'def']) {
        const list = d.players.filter((p) => p.t === t).sort(sortFn);
        const sc = d.mode === 'elim' ? d.score[t] : d.kills[t];
        html += `<div class="sbTeam ${t}"><h3><span>${TEAMS[t].name}</span><b>${sc}</b></h3><table>${head}${list.map(row).join('')}</table></div>`;
      }
    }
    const spec = d.players.filter((p) => p.t === 'spec');
    if (spec.length) html += `<div class="sbSpec">Espectadores: ${spec.map((p) => esc(p.n)).join(', ')}</div>`;
    if (d.code) html += `<div class="sbCode">Sala: <b>${esc(d.code)}</b></div>`;
    this.el.score.innerHTML = html;
  }

  // ---------------- menu de compra ----------------
  showBuy(show, ctx) {
    const e = this.el.buy;
    e.classList.toggle('show', show);
    if (!show) return;
    this.buyItems = [];
    let html = `<div class="buyHead"><h2>Comprar</h2><div class="buyMoney">${ctx.econ ? '$' + ctx.money : 'Grátis neste modo'}</div></div>`;
    if (!ctx.canBuy) html += `<div class="buyWarn">${ctx.elim ? 'Você só pode comprar na sua base, no início da rodada.' : 'Compra liberada só nos primeiros segundos depois de renascer.'}</div>`;
    html += '<div class="buyCols">';
    let n = 1;
    for (const cat of BUY_MENU) {
      html += `<div class="buyCat"><h4>${cat.title}</h4>`;
      for (const id of cat.items) {
        const info = itemInfo(id);
        if (info.team && ctx.team && info.team !== ctx.team) continue;
        if (id === 'kit' && (!ctx.elim || ctx.team !== 'def')) continue;
        let price = info.price;
        if (id === 'vesthelm' && ctx.owned.armor >= 100 && !ctx.owned.helmet && ctx.econ) price = 350;
        const owned = id === ctx.owned.primary || id === ctx.owned.secondary || ctx.owned.nades.includes(id) ||
          (id === 'vest' && ctx.owned.armor >= 100) || (id === 'vesthelm' && ctx.owned.armor >= 100 && ctx.owned.helmet) || (id === 'kit' && ctx.owned.kit);
        const cant = !ctx.canBuy || (ctx.econ && price > ctx.money) || owned;
        const hot = n <= 9 ? n : null;
        this.buyItems.push(id);
        const w = WEAPONS[id];
        const stats = w ? `<small>${w.kind === 'shotgun' ? w.pellets + '×' : ''}${w.dmg} dano · ${w.mag} balas</small>` : '';
        html += `<button class="buyItem ${owned ? 'owned' : ''}" data-id="${id}" ${cant ? 'disabled' : ''}>
          ${hot ? `<kbd>${hot}</kbd>` : ''}<span class="bn">${esc(info.name)}</span>${stats}<span class="bp">${ctx.econ ? '$' + price : ''}${owned ? ' ✓' : ''}</span></button>`;
        n++;
      }
      html += '</div>';
    }
    html += '</div><div class="buyFoot">B ou Esc para fechar · clique para comprar</div>';
    e.innerHTML = html;
    e.querySelectorAll('.buyItem').forEach((b) => {
      b.addEventListener('click', () => this.onBuy(b.dataset.id));
    });
  }

  buyHotkey(n) {
    const id = this.buyItems[n - 1];
    if (!id) return;
    const btn = this.el.buy.querySelector(`.buyItem[data-id="${id}"]`);
    if (btn && !btn.disabled) this.onBuy(id);
  }

  // ---------------- radar ----------------
  buildRadarBg(map) {
    const s = 6; // px por célula
    const c = document.createElement('canvas');
    c.width = GW * s; c.height = GH * s;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(20,22,26,0.9)';
    g.fillRect(0, 0, c.width, c.height);
    for (let r = 0; r < GH; r++) {
      for (let col = 0; col < GW; col++) {
        const ch = map.grid[r][col];
        const z = map.zones[r][col];
        if (ch === '#') continue;
        g.fillStyle = z === 'A' || z === 'B' ? '#8a5a4a' : z === 'T' ? '#7a6548' : z === 'D' ? '#4a5f7a' : '#6f6a5f';
        if (ch === 't') g.fillStyle = '#55524b';
        if (ch === 'c' || ch === 'C') g.fillStyle = '#4b4236';
        if (ch === 's' || ch === 'p' || ch === 'q') g.fillStyle = '#5c5a55';
        g.fillRect(col * s, r * s, s, s);
      }
    }
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = 'bold 22px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const site of ['A', 'B']) {
      const [x, z] = map.siteCenter[site];
      g.fillText(site, ((x - OX) / CELL) * s, ((z - OZ) / CELL) * s);
    }
    this.radarBg = c;
    this.radarScale = s / CELL;
  }

  drawRadar(d) {
    if (!this.radarBg) this.buildRadarBg(d.map);
    const g = this.radarCtx;
    const W = this.el.radar.width, H = this.el.radar.height;
    const k = this.radarScale * 1.25;
    g.clearRect(0, 0, W, H);
    g.save();
    g.beginPath();
    g.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = 'rgba(10,12,16,0.75)';
    g.fillRect(0, 0, W, H);
    g.translate(W / 2, H / 2);
    g.rotate(d.yaw);
    g.scale(k / this.radarScale, k / this.radarScale);
    g.translate(-(d.cx - OX) * this.radarScale, -(d.cz - OZ) * this.radarScale);
    g.globalAlpha = 0.9;
    g.drawImage(this.radarBg, 0, 0);
    g.globalAlpha = 1;
    const toPx = (x, z) => [(x - OX) * this.radarScale, (z - OZ) * this.radarScale];
    const inv = this.radarScale / k;
    for (const p of d.dots) {
      const [x, y] = toPx(p.x, p.z);
      g.fillStyle = p.dead ? 'rgba(160,160,160,0.6)' : p.color;
      if (p.dead) {
        g.font = `${14 * inv}px sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('✕', x, y);
        continue;
      }
      g.beginPath();
      g.arc(x, y, 4 * inv, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      g.lineWidth = 1.2 * inv;
      g.stroke();
      if (p.bomb) {
        g.fillStyle = '#ffcc33';
        g.fillRect(x + 3 * inv, y - 6 * inv, 4 * inv, 4 * inv);
      }
    }
    if (d.bomb) {
      const [x, y] = toPx(d.bomb.x, d.bomb.z);
      g.fillStyle = d.bomb.planted ? (Math.floor(performance.now() / 300) % 2 ? '#ff3030' : '#ffcc33') : '#ffcc33';
      g.fillRect(x - 4 * inv, y - 3 * inv, 8 * inv, 6 * inv);
    }
    g.restore();
    // eu (seta no centro)
    if (d.me) {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(W / 2, H / 2 - 7);
      g.lineTo(W / 2 + 5, H / 2 + 5);
      g.lineTo(W / 2, H / 2 + 2);
      g.lineTo(W / 2 - 5, H / 2 + 5);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
    g.stroke();
  }
}

export { GEAR };
