// Configuração do multiplayer online.
//
// O jogo usa o Supabase Realtime (o mesmo projeto Supabase dos outros jogos) para:
//   - sinalização WebRTC (os dados do jogo vão direto entre os navegadores, P2P)
//   - lista de salas abertas no menu
//   - relé de reserva quando a conexão direta não fecha (NAT restrito/CGNAT)
//
// Os valores podem vir de dois lugares (o primeiro preenchido vence):
//   1) Variáveis de ambiente na Vercel, lidas por /api/ponto-zero-config:
//        SUPABASE_URL e SUPABASE_ANON_KEY
//        (também aceita NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
//         e VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
//   2) Este arquivo. A anon key (ou publishable key) é pública por natureza,
//      pode ficar no front. NUNCA coloque a service_role / secret key aqui.
//
// Se nada estiver configurado, o jogo cai para o PeerJS (servidor público de sinalização).

export const ONLINE = {
  supabaseUrl: '',
  supabaseAnonKey: 'sb_publishable_ezENL9LugGzfpky76sRXMA__imRUzmh',
  // Servidores STUN para o WebRTC. Dá para acrescentar um TURN próprio aqui:
  // { urls: 'turn:meu.turn:3478', username: 'x', credential: 'y' }
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
  // tempo (ms) esperando a conexão direta antes de usar o relé pelo Supabase
  directTimeout: 7000,
};
