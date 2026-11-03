// Constantes do jogo: times, modos, economia, armas.
// Unidades: metros, segundos, graus (recuo) e radianos (imprecisão).

export const TEAMS = {
  atk: { id: 'atk', name: 'Atacantes', short: 'ATK', color: '#f08a3c', hex: 0xf08a3c },
  def: { id: 'def', name: 'Defensores', short: 'DEF', color: '#4f9bff', hex: 0x4f9bff },
  ffa: { id: 'ffa', name: 'Livre', short: 'FFA', color: '#e6e6e6', hex: 0xe6e6e6 },
  spec: { id: 'spec', name: 'Espectador', short: 'ESP', color: '#9aa0a6', hex: 0x9aa0a6 },
};

export const MODES = {
  elim: {
    id: 'elim',
    name: 'Mata-mata',
    desc: 'Rodadas sem renascer. Atacantes plantam a bomba no ponto A ou B, defensores protegem e desarmam. Dinheiro por rodada para comprar armas.',
    teams: true,
  },
  tdm: {
    id: 'tdm',
    name: 'Team Deathmatch',
    desc: 'Dois times com renascimento em 3 s. Armas liberadas. O primeiro time a chegar no limite de abates vence.',
    teams: true,
  },
  ffa: {
    id: 'ffa',
    name: 'Todos por Um',
    desc: 'Cada um por si, todos contra todos. Renascimento rápido e armas liberadas. Quem chegar primeiro no limite de abates vence.',
    teams: false,
  },
};

export const DIFFICULTY = {
  facil: { name: 'Fácil', reaction: 0.7, aimError: 0.085, turn: 4.0, headChance: 0.1, burst: 3 },
  normal: { name: 'Normal', reaction: 0.42, aimError: 0.05, turn: 7.0, headChance: 0.25, burst: 4 },
  dificil: { name: 'Difícil', reaction: 0.24, aimError: 0.026, turn: 11.0, headChance: 0.45, burst: 5 },
};

export const ECON = {
  start: 800,
  max: 16000,
  win: 3250,
  winBomb: 3500,
  winDefuse: 3500,
  loss: 1400,
  lossStep: 500,
  lossMax: 3400,
  plantBonus: 800,
  plantReward: 300,
  defuseReward: 300,
};

export const ROUND = {
  freeze: 6,
  live: 115,
  buyTime: 20, // segundos de compra depois que o freeze termina
  end: 6,
  bombTimer: 40,
  plantTime: 3.2,
  defuseTime: 7,
  defuseKit: 3.5,
  matchEnd: 12,
  respawn: 3,
  spawnProtect: 1.6,
  tdmBuyWindow: 12,
};

export const PLAYER = {
  radius: 0.36,
  height: 1.8,
  crouchHeight: 1.18,
  eye: 1.64,
  crouchEye: 1.04,
  gravity: 20,
  jump: 7.0,
  accel: 9,
  airAccel: 2.2,
  friction: 6,
  stopSpeed: 1.6,
  walkMul: 0.52,
  crouchMul: 0.36,
  step: 0.6,
};

// Armas. dmg = dano base; rangeMod = fator de queda a cada 10 m; armorPen = fração que passa pelo colete.
// inacc = imprecisão parado (rad); move = imprecisão extra correndo; air = no ar; spray = cresce no spray.
// recoilV/recoilH = recuo vertical/horizontal por tiro (graus).
export const WEAPONS = {
  knife: {
    id: 'knife', name: 'Faca', short: 'Faca', slot: 'knife', kind: 'knife',
    dmg: 40, heavy: 65, rate: 0.42, heavyRate: 0.95, range: 1.9, speed: 6.25, reward: 1500, draw: 0.35,
  },
  p9: {
    id: 'p9', name: 'P-9 Vespa', short: 'P-9', slot: 'secondary', kind: 'pistol', price: 200,
    dmg: 30, armorPen: 0.5, rangeMod: 0.86, rate: 0.15, auto: false, mag: 20, reserve: 100, reload: 2.1,
    draw: 0.45, speed: 6.0, inacc: 0.007, move: 0.045, air: 0.14, spray: 0.014, recoilV: 1.8, recoilH: 0.45,
    reward: 300, snd: 'pistol',
  },
  lince: {
    id: 'lince', name: 'Magnum Lince', short: 'Lince', slot: 'secondary', kind: 'pistol', price: 700,
    dmg: 63, armorPen: 0.93, rangeMod: 0.81, rate: 0.24, auto: false, mag: 7, reserve: 35, reload: 2.2,
    draw: 0.55, speed: 5.8, inacc: 0.006, move: 0.09, air: 0.2, spray: 0.035, recoilV: 5.2, recoilH: 1.1,
    reward: 300, snd: 'magnum',
  },
  coral: {
    id: 'coral', name: 'Coral .45', short: 'Coral', slot: 'secondary', kind: 'pistol', price: 500,
    dmg: 38, armorPen: 0.65, rangeMod: 0.85, rate: 0.17, auto: false, mag: 12, reserve: 60, reload: 2.3,
    draw: 0.5, speed: 6.0, inacc: 0.006, move: 0.05, air: 0.15, spray: 0.02, recoilV: 2.6, recoilH: 0.6,
    reward: 300, snd: 'magnum',
  },
  marimbondo: {
    id: 'marimbondo', name: 'Marimbondo (automática)', short: 'Marimbondo', slot: 'secondary', kind: 'pistol', price: 500,
    dmg: 24, armorPen: 0.5, rangeMod: 0.8, rate: 0.06, auto: true, mag: 18, reserve: 90, reload: 2.2,
    draw: 0.45, speed: 6.0, inacc: 0.012, move: 0.04, air: 0.12, spray: 0.05, recoilV: 1.2, recoilH: 0.8,
    reward: 300, snd: 'pistol',
  },
  siri: {
    id: 'siri', name: 'Siri SMG', short: 'Siri', slot: 'primary', kind: 'smg', price: 1050,
    dmg: 22, armorPen: 0.55, rangeMod: 0.78, rate: 0.065, auto: true, mag: 30, reserve: 120, reload: 2.2,
    draw: 0.5, speed: 6.1, inacc: 0.013, move: 0.02, air: 0.12, spray: 0.035, recoilV: 0.75, recoilH: 0.7,
    reward: 600, snd: 'smg',
  },
  corisco: {
    id: 'corisco', name: 'Corisco 50', short: 'Corisco', slot: 'primary', kind: 'smg', price: 2350,
    dmg: 25, armorPen: 0.69, rangeMod: 0.84, rate: 0.07, auto: true, mag: 50, reserve: 100, reload: 3.3,
    draw: 0.6, speed: 5.9, inacc: 0.01, move: 0.022, air: 0.12, spray: 0.028, recoilV: 0.7, recoilH: 0.55,
    reward: 300, snd: 'smg',
  },
  ferrao: {
    id: 'ferrao', name: 'Ferrão SMG', short: 'Ferrão', slot: 'primary', kind: 'smg', price: 1250,
    dmg: 26, armorPen: 0.6, rangeMod: 0.8, rate: 0.075, auto: true, mag: 30, reserve: 120, reload: 2.4,
    draw: 0.55, speed: 6.0, inacc: 0.011, move: 0.022, air: 0.12, spray: 0.03, recoilV: 0.85, recoilH: 0.6,
    reward: 600, snd: 'smg',
  },
  trovao: {
    id: 'trovao', name: 'Trovão 12', short: 'Trovão', slot: 'primary', kind: 'shotgun', price: 1100,
    dmg: 22, pellets: 9, armorPen: 0.6, rangeMod: 0.45, rate: 0.88, auto: false, mag: 7, reserve: 28, reload: 2.8,
    draw: 0.6, speed: 5.5, inacc: 0.06, move: 0.02, air: 0.1, spray: 0, recoilV: 6, recoilH: 1.5,
    reward: 900, snd: 'shotgun',
  },
  bigorna: {
    id: 'bigorna', name: 'Bigorna Auto-12', short: 'Bigorna', slot: 'primary', kind: 'shotgun', price: 2000,
    dmg: 20, pellets: 8, armorPen: 0.6, rangeMod: 0.5, rate: 0.25, auto: false, mag: 8, reserve: 32, reload: 3.0,
    draw: 0.6, speed: 5.4, inacc: 0.07, move: 0.02, air: 0.1, spray: 0, recoilV: 4, recoilH: 1.2,
    reward: 900, snd: 'shotgun',
  },
  sucuri: {
    id: 'sucuri', name: 'Sucuri (metralhadora)', short: 'Sucuri', slot: 'primary', kind: 'lmg', price: 5200,
    dmg: 32, armorPen: 0.8, rangeMod: 0.97, rate: 0.08, auto: true, mag: 100, reserve: 200, reload: 5.0,
    draw: 1.0, speed: 4.9, inacc: 0.008, move: 0.12, air: 0.3, spray: 0.05, recoilV: 0.9, recoilH: 1.0,
    reward: 300, snd: 'lmg',
  },
  pardal: {
    id: 'pardal', name: 'Fuzil Pardal', short: 'Pardal', team: 'atk', slot: 'primary', kind: 'rifle', price: 1800,
    dmg: 30, armorPen: 0.77, rangeMod: 0.96, rate: 0.09, auto: true, mag: 35, reserve: 90, reload: 2.6,
    draw: 0.65, speed: 5.6, inacc: 0.006, move: 0.085, air: 0.24, spray: 0.045, recoilV: 1.25, recoilH: 1.0,
    reward: 300, snd: 'rifle2',
  },
  sabia: {
    id: 'sabia', name: 'Carabina Sabiá', short: 'Sabiá', team: 'def', slot: 'primary', kind: 'rifle', price: 2000,
    dmg: 30, armorPen: 0.7, rangeMod: 0.96, rate: 0.09, auto: true, mag: 25, reserve: 90, reload: 3.0,
    draw: 0.65, speed: 5.6, inacc: 0.0055, move: 0.08, air: 0.24, spray: 0.04, recoilV: 1.15, recoilH: 0.9,
    reward: 300, snd: 'rifle2',
  },
  coruja: {
    id: 'coruja', name: 'Coruja (fuzil com luneta)', short: 'Coruja', slot: 'primary', kind: 'rifle', price: 3000,
    dmg: 32, armorPen: 0.8, rangeMod: 0.98, rate: 0.1, auto: true, mag: 30, reserve: 90, reload: 2.9,
    draw: 0.7, speed: 5.4, inacc: 0.005, scopedInacc: 0.0025, move: 0.08, air: 0.24, spray: 0.035, recoilV: 1.0,
    recoilH: 0.6, reward: 300, snd: 'rifle', scope: [45],
  },
  andorinha: {
    id: 'andorinha', name: 'Andorinha .308 (sniper leve)', short: 'Andorinha', slot: 'primary', kind: 'sniper', price: 1700,
    dmg: 88, armorPen: 0.85, rangeMod: 0.98, rate: 1.25, auto: false, mag: 10, reserve: 90, reload: 3.0,
    draw: 0.7, speed: 5.9, inacc: 0.03, scopedInacc: 0.0015, move: 0.12, air: 0.04, spray: 0, recoilV: 4,
    recoilH: 0.4, reward: 300, snd: 'scout', scope: [40, 15],
  },
  urubu: {
    id: 'urubu', name: 'Urubu (sniper automática)', short: 'Urubu', slot: 'primary', kind: 'sniper', price: 5000,
    dmg: 80, armorPen: 0.9, rangeMod: 0.98, rate: 0.25, auto: false, mag: 20, reserve: 90, reload: 3.5,
    draw: 0.9, speed: 5.0, inacc: 0.06, scopedInacc: 0.002, move: 0.2, air: 0.4, spray: 0.01, recoilV: 3.0,
    recoilH: 0.6, reward: 300, snd: 'sniper', scope: [40, 15],
  },
  k47: {
    id: 'k47', name: 'Fuzil K-47', short: 'K-47', team: 'atk', slot: 'primary', kind: 'rifle', price: 2700,
    dmg: 36, armorPen: 0.775, rangeMod: 0.98, rate: 0.1, auto: true, mag: 30, reserve: 90, reload: 2.5,
    draw: 0.7, speed: 5.4, inacc: 0.0045, move: 0.09, air: 0.25, spray: 0.04, recoilV: 1.45, recoilH: 0.9,
    reward: 300, snd: 'rifle',
  },
  t4: {
    id: 't4', name: 'Carabina T4', short: 'T4', team: 'def', slot: 'primary', kind: 'rifle', price: 3100,
    dmg: 33, armorPen: 0.7, rangeMod: 0.97, rate: 0.09, auto: true, mag: 30, reserve: 90, reload: 3.1,
    draw: 0.7, speed: 5.6, inacc: 0.0038, move: 0.08, air: 0.23, spray: 0.032, recoilV: 1.15, recoilH: 0.7,
    reward: 300, snd: 'rifle2',
  },
  gaviao: {
    id: 'gaviao', name: 'Gavião .338 (sniper pesada)', short: 'Gavião', slot: 'primary', kind: 'sniper', price: 4750,
    dmg: 115, armorPen: 0.97, rangeMod: 0.99, rate: 1.45, auto: false, mag: 5, reserve: 30, reload: 3.6,
    draw: 0.9, speed: 5.0, inacc: 0.085, scopedInacc: 0.0012, move: 0.22, air: 0.4, spray: 0, recoilV: 7,
    recoilH: 0.5, reward: 100, snd: 'sniper', scope: [40, 14],
  },
};

export const NADES = {
  he: { id: 'he', name: 'Granada HE', short: 'HE', price: 300, fuse: 1.6 },
  flash: { id: 'flash', name: 'Granada de luz', short: 'Luz', price: 200, fuse: 1.5 },
  smoke: { id: 'smoke', name: 'Fumaça', short: 'Fumaça', price: 300, fuse: 1.3 },
  molotov: { id: 'molotov', name: 'Incendiária', short: 'Fogo', price: 500, fuse: 2.0 },
};

export const GEAR = {
  vest: { id: 'vest', name: 'Colete', price: 650 },
  vesthelm: { id: 'vesthelm', name: 'Colete + Capacete', price: 1000 },
  kit: { id: 'kit', name: 'Kit de desarme', price: 400, team: 'def' },
};

// Ordem do menu de compra
export const BUY_MENU = [
  { title: 'Pistolas', items: ['p9', 'coral', 'marimbondo', 'lince'] },
  { title: 'SMGs', items: ['siri', 'ferrao', 'corisco'] },
  { title: 'Pesadas', items: ['trovao', 'bigorna', 'sucuri'] },
  { title: 'Fuzis', items: ['pardal', 'sabia', 'k47', 't4', 'coruja'] },
  { title: 'Snipers', items: ['andorinha', 'gaviao', 'urubu'] },
  { title: 'Granadas', items: ['flash', 'smoke', 'he', 'molotov'] },
  { title: 'Equipamento', items: ['vest', 'vesthelm', 'kit'] },
];

export function itemInfo(id) {
  return WEAPONS[id] || NADES[id] || GEAR[id] || null;
}

export const BOT_NAMES = [
  'Zé Mira', 'Tonhão', 'Bia Bala', 'Juca', 'Neto', 'Lia', 'Duda', 'Rafa', 'Kiko', 'Mel',
  'Dinho', 'Gabi', 'Chico', 'Nina', 'Tião', 'Lulu', 'Beto', 'Malu', 'Caju', 'Pipoca',
];

export const SNAP_RATE = 20; // snapshots por segundo
export const SEND_RATE = 20; // estado do cliente por segundo
export const INTERP_DELAY = 110; // ms
