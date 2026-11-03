# Ponto Zero

Um FPS tático multiplayer que roda direto no navegador. É um jogo original, inspirado em shooters
táticos de rodada: um mapa (Vila Seca), três modos, economia, bomba, granadas e bots.
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

## Multiplayer

O multiplayer é **P2P via WebRTC** usando [PeerJS](https://peerjs.com/). Por isso funciona em
hospedagem estática como a Vercel, sem backend próprio:

1. Quem clica em **Criar sala online** vira o *host*. O navegador dele roda o servidor autoritativo
   (`js/server.js`): rodadas, dano, economia, bomba, granadas e bots.
2. A sala recebe um código de 5 letras. Os amigos entram com **Entrar** + código, ou pelo link de
   convite (`?sala=CODIGO`), que dá para copiar no menu `Esc`.
3. Cada cliente manda a própria posição 20 vezes por segundo e os tiros com o que acertou. O host valida
   (vivo, tem a arma, cadência, distância), aplica o dano e devolve snapshots 20 vezes por segundo.
   Os outros jogadores aparecem interpolados com 110 ms de atraso.
4. A sala começa em **aquecimento**: todo mundo renasce à vontade enquanto a galera entra, até o
   host iniciar a partida no menu `Esc`. Ali o host também troca o modo, o número de bots, a
   dificuldade e o limite.

Observações:

- Se o host fechar a aba, a partida acaba para todos.
- Se a aba do host for para segundo plano, um Web Worker mantém o servidor rodando.
- A sinalização usa o servidor público do PeerJS (`0.peerjs.com`). Para usar um PeerServer
  próprio: `?peerhost=meu.servidor&peerport=443&peerpath=/`.

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
│   ├── net.js          PeerJS: HostNet e ClientNet
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
└── vendor/             three.js 0.160.0 e PeerJS 1.5.4 (MIT)
```

## Rodar localmente

Qualquer servidor estático serve:

```bash
cd portifolio
python3 -m http.server 8080
# abra http://localhost:8080/ponto-zero/
```

Na Vercel, a pasta fica publicada em `/ponto-zero/` junto com o portfólio.
