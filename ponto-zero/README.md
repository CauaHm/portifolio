# Ponto Zero

Um FPS tático multiplayer que roda direto no navegador. É um jogo original, inspirado em shooters
táticos de rodada: um mapa (Vila Seca, com dois pontos de bomba, três rotas, portões, galerias
cobertas e mirante), três modos, economia, bomba, granadas e bots.
Nenhuma arte, som ou nome foi tirado de outro jogo. Tudo é gerado no código: texturas em canvas,
modelos com primitivas do Three.js e sons sintetizados com Web Audio.

## Modos

| Modo | Como funciona |
| --- | --- |
| **Mata-mata** | Rodadas sem renascer. Os Atacantes plantam a bomba no ponto A ou B (40 s até explodir) e os Defensores protegem e desarmam (7 s, ou 3,5 s com kit). Tem economia por rodada ($800 inicial, bônus por vitória ou derrota, recompensa por abate), tempo de compra, troca de lados no meio e partida em 3, 5, 8 ou 13 rodadas. |
| **Team Deathmatch** | Dois times com renascimento em 3 s e armas liberadas. Vence o primeiro time a chegar no limite de abates (ou quem tiver mais em 10 min). |
| **Todos por Um** | Todos contra todos, com renascimento rápido. Vence quem chegar primeiro no limite de abates. |

## Armas e equipamento

- **Pistolas:** P-9 Vespa (padrão) e Magnum Lince
- **SMG / escopeta:** Ferrão SMG e Trovão 12
- **Fuzis:** Fuzil K-47 (Atacantes), Carabina T4 (Defensores) e Gavião .338 (sniper com 2 níveis de zoom)
- **Granadas:** HE, granada de luz (cega quem estiver olhando) e fumaça (bloqueia a visão, inclusive a dos bots)
- **Equipamento:** colete, colete + capacete e kit de desarme
- **Faca:** golpe rápido e golpe forte. Pelas costas o dano é dobrado.

Os tiros seguem o estilo tático: o primeiro é preciso, correr ou pular atrapalha a mira, agachar
ajuda, cada arma tem recuo vertical e horizontal no spray, o dano cai com a distância, o colete
reduz o dano e o tiro na cabeça multiplica por 4.

## Controles

`WASD` andar · `Shift` andar em silêncio · `C`/`Ctrl` agachar · `Espaço` pular · `Mouse 1` atirar ·
`Mouse 2` mira da sniper, facada forte ou granada fraca · `R` recarregar · `1`–`5`, `Q` e roda do mouse trocam de arma ·
`B` comprar · `E` (segurar) plantar/desarmar · `G` largar a arma · `Tab` placar · `Y`/`U` chat geral/do time ·
`M` trocar de time · `Esc` menu (opções e controles do host)

## Multiplayer (Supabase + WebRTC)

O host é autoritativo: o navegador de quem cria a sala roda o servidor do jogo (`js/server.js`),
com rodadas, dano, economia, bomba, granadas e bots. A conexão funciona assim:

1. **Supabase Realtime** (o mesmo projeto Supabase dos outros jogos) faz a sinalização: troca de
   oferta/resposta/ICE do WebRTC no canal `pontozero-v1:CODIGO` e a **lista de salas abertas** no
   menu (presence no canal `pontozero-v1:lobby`). Não precisa criar tabela nenhuma.
2. Os dados do jogo vão **direto entre os navegadores** por WebRTC, em dois canais: um confiável
   (eventos, tiros, compras) e um rápido sem retransmissão (posições e snapshots a 20/s). Isso gasta
   quase nada da cota do Supabase: só a sinalização.
3. Se a conexão direta não fechar em 7 s (NAT restrito/CGNAT), aquele jogador passa a usar o
   **relé pelo Supabase** a 10 atualizações/s, e o jogo avisa com uma mensagem.
4. Sem Supabase configurado, o jogo cai para o **PeerJS** (servidor público de sinalização).

### Como ligar o Supabase na Vercel

No projeto da Vercel (Settings → Environment Variables), crie as mesmas variáveis dos outros jogos:

| Variável | Valor |
| --- | --- |
| `SUPABASE_URL` | `https://SEU-PROJETO.supabase.co` |
| `SUPABASE_ANON_KEY` | a chave **anon** ou **publishable** (nunca a service_role/secret) |

Também valem os nomes `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` e
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`. A função `/api/ponto-zero-config` (na raiz do repo)
entrega esses dois valores ao jogo e recusa qualquer chave que não seja pública. Depois de salvar,
faça um redeploy. O menu mostra "Online via Supabase + WebRTC" quando der certo.

Outra opção é colar a URL e a anon key direto em `js/online-config.js`. No Supabase, o Realtime precisa
estar ligado (ele vem ligado por padrão).

### Jogando

- **Criar sala online**: você vira o host e recebe um código de 5 letras. Copie o link de convite
  (`?sala=CODIGO`) no menu `Esc`.
- **Entrar**: digite o código ou clique na sala na lista de salas abertas.
- A sala começa em **aquecimento** (todos renascem à vontade). O host inicia a partida e troca
  modo, bots, dificuldade e limite pelo menu `Esc`.
- Se o host fechar a aba, a partida acaba. Com a aba em segundo plano, um Web Worker mantém o
  servidor rodando.

## Treino offline

**Treinar offline com bots** roda o servidor localmente, sem rede, em qualquer modo. Os bots
navegam por A* na grade do mapa, compram armas conforme o dinheiro, plantam e desarmam a bomba,
seguram os pontos, reagem a tiros e dano e erram mais ou menos conforme a dificuldade.

## Estrutura

```
ponto-zero/
├── index.html          telas (menu, criar sala, jogo, pausa, seleção de time)
├── css/game.css        visual do menu e HUD
├── js/
│   ├── main.js         fluxo de telas e sessão (offline, host, cliente)
│   ├── net-supabase.js Supabase Realtime + WebRTC (host, cliente, lista de salas)
│   ├── online-config.js URL/anon key do Supabase e servidores STUN/TURN
│   ├── net.js          PeerJS (reserva): HostNet e ClientNet
│   ├── server.js       servidor autoritativo (regras dos 3 modos)
│   ├── bots.js         IA dos bots
│   ├── client.js       render, entrada, arma local, interpolação, efeitos
│   ├── hud.js          HUD, placar, menu de compra, radar
│   ├── map.js          grade do mapa, colisão, raycast e A*
│   ├── physics.js      movimento, hitboxes, dano, granadas
│   ├── render-map.js   geometria e texturas procedurais do mapa
│   ├── avatar.js       bonecos em terceira pessoa
│   ├── viewmodel.js    arma em primeira pessoa
│   ├── models.js       modelos das armas
│   ├── effects.js      traçantes, partículas, marcas, explosões, fumaça
│   ├── audio.js        sons sintetizados e áudio posicional
│   └── config.js       armas, economia, tempos, modos
└── vendor/             three.js 0.160.0, supabase-js 2.45.4 e PeerJS 1.5.4 (MIT)

api/ponto-zero-config.js (na raiz do portfólio): função da Vercel que lê as variáveis do Supabase
```

## Rodar localmente

Qualquer servidor estático serve:

```bash
cd portifolio
python3 -m http.server 8080
# abra http://localhost:8080/ponto-zero/
```

Na Vercel, a pasta fica publicada em `/ponto-zero/` junto com o portfólio.
