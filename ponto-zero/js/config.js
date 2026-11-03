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
    id: 'gaviao', name: 'Gavião .338', short: 'Gavião', slot: 'primary', kind: 'sniper', price: 4750,
    dmg: 115, armorPen: 0.97, rangeMod: 0.99, rate: 1.45, auto: false, mag: 5, reserve: 30, reload: 3.6,
    draw: 0.9, speed: 5.0, inacc: 0.085, scopedInacc: 0.0012, move: 0.22, air: 0.4, spray: 0, recoilV: 7,
    recoilH: 0.5, reward: 100, snd: 'sniper', scope: [40, 14],
  },
};

export const NADES = {
  he: { id: 'he', name: 'Granada HE', short: 'HE', price: 300, fuse: 1.6 },
  flash: { id: 'flash', name: 'Granada de luz', short: 'Luz', price: 200, fuse: 1.5 },
  smoke: { id: 'smoke', name: 'Fumaça', short: 'Fumaça', price: 300, fuse: 1.3 },
};

export const GEAR = {
  vest: { id: 'vest', name: 'Colete', price: 650 },
  vesthelm: { id: 'vesthelm', name: 'Colete + Capacete', price: 1000 },
  kit: { id: 'kit', name: 'Kit de desarme', price: 400, team: 'def' },
};

// Ordem do menu de compra
export const BUY_MENU = [
  { title: 'Pistolas', items: ['p9', 'lince'] },
  { title: 'SMG e Escopeta', items: ['ferrao', 'trovao'] },
  { title: 'Fuzis', items: ['k47', 't4', 'gaviao'] },
  { title: 'Equipamento', items: ['vest', 'vesthelm', 'kit'] },
  { title: 'Granadas', items: ['he', 'flash', 'smoke'] },
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
