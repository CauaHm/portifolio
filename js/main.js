(function(){
  'use strict';

  var reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var pontoFino = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var raiz = document.documentElement;

  /* ==========================================================================
     Carregamento — o gato atravessa a tela enquanto a página monta
     ========================================================================== */
  (function carga(){
    var caixa = document.getElementById('carga');
    var gato = document.getElementById('carga-gato');
    var chao = document.getElementById('carga-chao');
    var pct = document.getElementById('carga-pct');
    if(!caixa) return;

    function encerrar(){
      caixa.classList.add('saiu');
      document.body.style.overflow = '';
    }

    if(reduzido){ encerrar(); return; }

    document.body.style.overflow = 'hidden';
    var n = 0, fontesOk = false, terminou = false;

    var passo = setInterval(function(){
      // Segura em 90 até as fontes chegarem, para não abrir na cara feia
      var teto = fontesOk ? 100 : 90;
      n = Math.min(teto, n + 1.6 + Math.random() * 3);
      var v = Math.floor(n);
      pct.textContent = (v < 10 ? '0' : '') + v + '%';
      // O gato fica parado; quem avança é o traço do chão sob ele
      chao.style.setProperty('--andado', n + '%');

      if(n >= 100 && !terminou){
        terminou = true;
        clearInterval(passo);
        setTimeout(encerrar, 420);
      }
    }, 85);

    if(document.fonts && document.fonts.ready){
      document.fonts.ready.then(function(){ fontesOk = true; });
    } else { fontesOk = true; }

    // Teto de segurança: se a rede travar, a página abre mesmo assim
    setTimeout(function(){ fontesOk = true; }, 3200);
    setTimeout(function(){
      if(!terminou){ terminou = true; clearInterval(passo); encerrar(); }
    }, 5200);
  })();

  /* ==========================================================================
     Campo de pontos em canvas
     ========================================================================== */
  (function campo(){
    var tela = document.getElementById('campo');
    if(!tela || reduzido) return;

    var ctx = tela.getContext('2d', { alpha:true });
    // No celular o ponteiro não existe: quem anima o campo é um ponto que
    // passeia sozinho, mais os toques do dedo. E a densidade cai um pouco,
    // porque o alvo é uma GPU de telefone.
    var grosso = !pontoFino;
    var dpr = Math.min(window.devicePixelRatio || 1, grosso ? 1.5 : 2);
    var pontos = [], larg = 0, alt = 0;
    var pt = { x:-9999, y:-9999 };
    var vagante = { x:-9999, y:-9999 };
    var ondas = [];
    var cor = [242,240,234];
    var laco = null, visivel = true;

    var ESPACO = grosso ? 38 : 44, RAIO = grosso ? 150 : 135, FORCA = grosso ? 27 : 24;
    var ONDA_VIDA = 1150, ONDA_VEL = 0.62, ONDA_ESPESSURA = 46;

    function medir(){
      larg = window.innerWidth; alt = window.innerHeight;
      tela.width = Math.floor(larg * dpr); tela.height = Math.floor(alt * dpr);
      tela.style.width = larg + 'px'; tela.style.height = alt + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      pontos = [];
      var col = Math.ceil(larg / ESPACO) + 1, lin = Math.ceil(alt / ESPACO) + 1;
      for(var i = 0; i < col; i++){
        for(var j = 0; j < lin; j++){
          pontos.push({ ox:i*ESPACO, oy:j*ESPACO, x:i*ESPACO, y:j*ESPACO });
        }
      }
    }

    // Empurra o ponto para longe de um centro e devolve o brilho que ganhou
    function atrai(p, cx, cy, alvo){
      var dx = p.ox - cx, dy = p.oy - cy;
      var d = Math.hypot(dx, dy);
      if(d >= RAIO) return 0;
      var f = 1 - d / RAIO, ang = Math.atan2(dy, dx);
      alvo.x += Math.cos(ang) * f * FORCA;
      alvo.y += Math.sin(ang) * f * FORCA;
      return f;
    }

    function desenhar(){
      var t = performance.now();

      // O passeio só existe no toque: no desktop quem manda é o ponteiro
      if(grosso){
        vagante.x = larg * (.5 + .36 * Math.sin(t / 5400));
        vagante.y = alt  * (.5 + .32 * Math.sin(t / 3900 + 1.1));
      }

      // Limpa ondas que já se apagaram
      for(var o = ondas.length - 1; o >= 0; o--){
        if(t - ondas[o].nasc > ONDA_VIDA){ ondas.splice(o, 1); }
      }

      ctx.clearRect(0, 0, larg, alt);
      var base = 'rgb(' + cor[0] + ',' + cor[1] + ',' + cor[2] + ')';

      for(var k = 0; k < pontos.length; k++){
        var p = pontos[k];
        var alvo = { x:p.ox, y:p.oy };
        var brilho = .2;

        brilho = Math.max(brilho, .2 + atrai(p, pt.x, pt.y, alvo) * .8);
        if(grosso){
          brilho = Math.max(brilho, .2 + atrai(p, vagante.x, vagante.y, alvo) * .55);
        }

        // Anel de toque: uma crista que atravessa o campo e some
        for(var w = 0; w < ondas.length; w++){
          var od = ondas[w];
          var idade = t - od.nasc;
          var raio = idade * ONDA_VEL;
          var dist = Math.abs(Math.hypot(p.ox - od.x, p.oy - od.y) - raio);
          if(dist < ONDA_ESPESSURA){
            var crista = (1 - dist / ONDA_ESPESSURA) * (1 - idade / ONDA_VIDA);
            var a = Math.atan2(p.oy - od.y, p.ox - od.x);
            alvo.x += Math.cos(a) * crista * 22;
            alvo.y += Math.sin(a) * crista * 22;
            brilho = Math.max(brilho, .2 + crista * .8);
          }
        }

        p.x += (alvo.x - p.x) * .12;
        p.y += (alvo.y - p.y) * .12;
        ctx.globalAlpha = brilho;
        ctx.fillStyle = base;
        ctx.fillRect(p.x, p.y, 1.5, 1.5);
      }
      ctx.globalAlpha = 1;
      laco = requestAnimationFrame(desenhar);
    }

    function ligar(){ if(!laco && visivel){ laco = requestAnimationFrame(desenhar); } }
    function desligar(){ if(laco){ cancelAnimationFrame(laco); laco = null; } }

    window.addEventListener('mousemove', function(e){ pt.x = e.clientX; pt.y = e.clientY; }, { passive:true });
    window.addEventListener('mouseleave', function(){ pt.x = -9999; pt.y = -9999; }, { passive:true });

    // O dedo faz as duas coisas: arrasta o campo e deixa um anel onde tocou
    window.addEventListener('touchstart', function(e){
      var d = e.touches[0]; if(!d) return;
      pt.x = d.clientX; pt.y = d.clientY;
      if(ondas.length < 4){ ondas.push({ x:d.clientX, y:d.clientY, nasc:performance.now() }); }
    }, { passive:true });
    window.addEventListener('touchmove', function(e){
      var d = e.touches[0]; if(!d) return;
      pt.x = d.clientX; pt.y = d.clientY;
    }, { passive:true });
    window.addEventListener('touchend', function(){
      // O ponto de atração solta devagar; o passeio assume de novo
      pt.x = -9999; pt.y = -9999;
    }, { passive:true });

    window.addEventListener('resize', medir, { passive:true });
    document.addEventListener('visibilitychange', function(){
      visivel = !document.hidden;
      visivel ? ligar() : desligar();
    });

    medir(); ligar();
    window.__campoCor = function(rgb){ cor = rgb; };
  })();

  /* ==========================================================================
     Cursor próprio
     ========================================================================== */
  (function cursor(){
    var ponto = document.getElementById('cursor');
    var anel = document.getElementById('cursor-anel');
    if(!ponto || !anel || !pontoFino) return;

    var alvo = { x:innerWidth/2, y:innerHeight/2 }, atual = { x:alvo.x, y:alvo.y };

    window.addEventListener('mousemove', function(e){
      alvo.x = e.clientX; alvo.y = e.clientY;
      ponto.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px) translate(-50%,-50%)';
    }, { passive:true });

    (function seguir(){
      atual.x += (alvo.x - atual.x) * .17;
      atual.y += (alvo.y - atual.y) * .17;
      anel.style.transform = 'translate(' + atual.x + 'px,' + atual.y + 'px) translate(-50%,-50%)';
      requestAnimationFrame(seguir);
    })();

    document.querySelectorAll('a,button,[data-ima],[data-inclina],.ficha-cores span').forEach(function(el){
      el.addEventListener('mouseenter', function(){ ponto.classList.add('grande'); });
      el.addEventListener('mouseleave', function(){ ponto.classList.remove('grande'); });
    });
    document.addEventListener('mouseleave', function(){ ponto.classList.add('oculto'); anel.style.opacity = '0'; });
    document.addEventListener('mouseenter', function(){ ponto.classList.remove('oculto'); anel.style.opacity = '.45'; });
  })();

  /* ==========================================================================
     Botões magnéticos
     ========================================================================== */
  (function imas(){
    if(reduzido || !pontoFino) return;
    document.querySelectorAll('[data-ima]').forEach(function(el){
      el.addEventListener('mousemove', function(e){
        var r = el.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width/2);
        var dy = e.clientY - (r.top + r.height/2);
        el.style.transform = 'translate(' + dx*.24 + 'px,' + dy*.32 + 'px)';
      });
      el.addEventListener('mouseleave', function(){
        el.style.transition = 'transform .55s cubic-bezier(.34,1.45,.64,1)';
        el.style.transform = '';
        setTimeout(function(){ el.style.transition = ''; }, 570);
      });
    });
  })();

  /* ==========================================================================
     Cartões que inclinam em 3D e acendem um halo sob o ponteiro
     ========================================================================== */
  (function inclina(){
    if(!pontoFino) return;
    document.querySelectorAll('[data-inclina]').forEach(function(el){
      el.addEventListener('mousemove', function(e){
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width;
        var py = (e.clientY - r.top) / r.height;
        // O halo segue o ponteiro mesmo com movimento reduzido; a inclinação, não
        el.style.setProperty('--px', (px*100) + '%');
        el.style.setProperty('--py', (py*100) + '%');
        if(reduzido) return;
        el.style.transform =
          'perspective(1000px) rotateY(' + (px - .5) * 9 + 'deg) rotateX(' + (.5 - py) * 9 + 'deg) translateY(-6px)';
      });
      el.addEventListener('mouseleave', function(){
        if(reduzido) return;
        el.style.transition = 'transform .6s cubic-bezier(.16,1,.3,1)';
        el.style.transform = '';
        setTimeout(function(){ el.style.transition = ''; }, 620);
      });
    });
  })();

  /* ==========================================================================
     Metamorfose dos mundos
     ========================================================================== */
  (function mundos(){
    var blocos = document.querySelectorAll('[data-mundo]');
    if(!blocos.length || !('IntersectionObserver' in window)) return;

    var MOLDURA = { fundo:'#0a0a0c', texto:'#f2f0ea', apoio:'#9a97a3', acento:'#8b7cff' };
    var meta = document.querySelector('meta[name="theme-color"]');

    function paraRgb(hex){
      return [parseInt(hex.substr(1,2),16), parseInt(hex.substr(3,2),16), parseInt(hex.substr(5,2),16)];
    }

    function vestir(b){
      var p = {
        fundo:  b.dataset.fundo  || MOLDURA.fundo,
        texto:  b.dataset.texto  || MOLDURA.texto,
        apoio:  b.dataset.apoio  || MOLDURA.apoio,
        acento: b.dataset.acento || MOLDURA.acento
      };
      raiz.style.setProperty('--m-fundo', p.fundo);
      raiz.style.setProperty('--m-texto', p.texto);
      raiz.style.setProperty('--m-apoio', p.apoio);
      raiz.style.setProperty('--m-acento', p.acento);
      if(meta){ meta.setAttribute('content', p.fundo); }
      if(window.__campoCor){ window.__campoCor(paraRgb(p.texto)); }
    }

    var io = new IntersectionObserver(function(entradas){
      // Vence quem ocupa mais tela: evita piscar na fronteira entre dois blocos
      var lider = null, maior = 0;
      entradas.forEach(function(e){
        if(e.isIntersecting && e.intersectionRatio > maior){
          maior = e.intersectionRatio; lider = e.target;
        }
      });
      if(lider){ vestir(lider); }
    }, { threshold:[.25,.5,.75] });

    blocos.forEach(function(b){ io.observe(b); });
  })();

  /* ==========================================================================
     Revelação e progresso
     ========================================================================== */
  (function revelar(){
    var alvos = document.querySelectorAll('.bloco, .outdoor');
    if('IntersectionObserver' in window){
      var io = new IntersectionObserver(function(entradas){
        entradas.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('revelado'); } });
      }, { threshold:.13 });
      alvos.forEach(function(el){ io.observe(el); });
    } else {
      alvos.forEach(function(el){ el.classList.add('revelado'); });
    }
  })();

  (function progresso(){
    var barra = document.getElementById('progresso');
    var cabecalho = document.getElementById('cabecalho');
    var ultimo = 0;
    window.addEventListener('scroll', function(){
      var y = window.scrollY;
      var rolavel = document.documentElement.scrollHeight - window.innerHeight;
      if(barra){ barra.style.setProperty('--lido', (rolavel > 0 ? (y/rolavel)*100 : 0) + '%'); }
      if(cabecalho){ cabecalho.classList.toggle('escondido', y > ultimo && y > 240); }
      ultimo = y;
    }, { passive:true });
  })();

  /* ==========================================================================
     Miniatura do dossiê
     ========================================================================== */
  (function fls(){
    var alvo = document.getElementById('g-fls-num');
    if(!alvo || reduzido || !('IntersectionObserver' in window)) return;
    var n = 1, timer = null;
    var io = new IntersectionObserver(function(entradas){
      entradas.forEach(function(e){
        if(e.isIntersecting && !timer){
          timer = setInterval(function(){
            n = n % 12 + 1;
            alvo.textContent = (n < 10 ? '0' : '') + n;
          }, 850);
        } else if(!e.isIntersecting && timer){
          clearInterval(timer); timer = null;
        }
      });
    }, { threshold:.4 });
    io.observe(alvo);
  })();

  /* ---------- Menu ---------- */
  var navLinks = document.getElementById('nav-links');
  var menuToggle = document.getElementById('menu-toggle');
  if(navLinks && menuToggle){
    // O menu virou tela cheia: enquanto está aberto, o corpo não rola atrás.
    function estado(aberto){
      navLinks.classList.toggle('aberto', aberto);
      document.body.classList.toggle('menu-aberto', aberto);
      menuToggle.setAttribute('aria-expanded', aberto ? 'true' : 'false');
      menuToggle.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
      menuToggle.textContent = aberto ? '✕' : '☰';
    }
    menuToggle.addEventListener('click', function(){
      estado(!navLinks.classList.contains('aberto'));
    });
    navLinks.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', function(){ estado(false); });
    });
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape' && navLinks.classList.contains('aberto')){
        estado(false); menuToggle.focus();
      }
    });
  }

  /* ==========================================================================
     Dock dos mundos — só no toque
     A metamorfose de cor é o coração da página, mas numa tela pequena o leitor
     perde a conta de onde está. O dock diz em que mundo ele entrou, veste a
     cor daquele mundo junto com a página e leva direto para os outros.
     ========================================================================== */
  (function dock(){
    if(pontoFino) return;
    var mundos = Array.prototype.slice.call(document.querySelectorAll('.mundo'));
    var caixaMundos = document.getElementById('mundos');
    if(!mundos.length || !caixaMundos || !('IntersectionObserver' in window)) return;

    function titulo(sec){
      var h = sec.querySelector('h2');
      return h ? h.textContent.replace(/\s+/g, ' ').trim() : '';
    }

    var barra = document.createElement('nav');
    barra.className = 'dock';
    barra.setAttribute('aria-label', 'Projetos');

    var nome = document.createElement('span');
    nome.className = 'dock-nome';
    nome.textContent = titulo(mundos[0]);

    var caixaPontos = document.createElement('div');
    caixaPontos.className = 'dock-pontos';

    var botoes = mundos.map(function(sec, i){
      if(!sec.id){ sec.id = 'mundo-' + (i + 1); }
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', titulo(sec));
      b.addEventListener('click', function(){
        sec.scrollIntoView({ behavior: reduzido ? 'auto' : 'smooth', block:'start' });
      });
      caixaPontos.appendChild(b);
      return b;
    });

    barra.appendChild(nome);
    barra.appendChild(caixaPontos);
    document.body.appendChild(barra);

    var atual = -1;
    function marcar(i){
      if(i === atual) return;
      atual = i;
      nome.textContent = titulo(mundos[i]);
      botoes.forEach(function(b, j){
        if(j === i){ b.setAttribute('aria-current', 'true'); }
        else { b.removeAttribute('aria-current'); }
      });
    }

    // Vence quem ocupa mais tela, como na metamorfose: evita piscar na fronteira
    var ioAtual = new IntersectionObserver(function(entradas){
      var lider = -1, maior = 0;
      entradas.forEach(function(e){
        if(e.isIntersecting && e.intersectionRatio > maior){
          maior = e.intersectionRatio;
          lider = mundos.indexOf(e.target);
        }
      });
      if(lider >= 0){ marcar(lider); }
    }, { threshold:[.3,.55,.8] });
    mundos.forEach(function(sec){ ioAtual.observe(sec); });

    // O dock só aparece enquanto a leitura está dentro dos mundos
    var ioFaixa = new IntersectionObserver(function(entradas){
      entradas.forEach(function(e){ barra.classList.toggle('dentro', e.isIntersecting); });
    }, { threshold:0, rootMargin:'-25% 0px -25% 0px' });
    ioFaixa.observe(caixaMundos);
  })();

  /* ==========================================================================
     Carrosséis com encaixe — método e cartões
     Empilhados no celular viravam lista longa. Deslizando de lado, o cartão do
     meio fica em foco: é o destaque que o hover dava no desktop, com o polegar.
     ========================================================================== */
  (function carrosseis(){
    var estreito = window.matchMedia('(max-width: 620px)');

    function montar(el, rotulo){
      if(!el) return;

      var pista = document.createElement('div');
      pista.className = 'carrossel-pista';
      pista.setAttribute('aria-hidden', 'true');
      var barra = document.createElement('i');
      pista.appendChild(barra);

      var dica = document.createElement('p');
      dica.className = 'carrossel-dica';
      dica.setAttribute('aria-hidden', 'true');
      dica.innerHTML = '<span>arraste</span>' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

      el.insertAdjacentElement('afterend', dica);
      el.insertAdjacentElement('afterend', pista);

      function atualizar(){
        var total = el.scrollWidth;
        if(total <= 0) return;
        var fatia = Math.min(1, el.clientWidth / total);
        var maximo = total - el.clientWidth;
        var andado = maximo > 0 ? el.scrollLeft / maximo : 0;
        barra.style.setProperty('--fatia', (fatia * 100) + '%');
        barra.style.setProperty('--pos', (andado * (100 / fatia - 100)) + '%');
      }

      var tocou = false;
      el.addEventListener('scroll', function(){
        atualizar();
        if(!tocou){ tocou = true; dica.classList.add('some'); }
      }, { passive:true });
      window.addEventListener('resize', atualizar, { passive:true });

      function aplicar(){
        if(estreito.matches){
          // Só vira região navegável quando de fato é um carrossel
          el.setAttribute('tabindex', '0');
          el.setAttribute('role', 'group');
          el.setAttribute('aria-label', rotulo);
          atualizar();
        } else {
          el.removeAttribute('tabindex');
          el.removeAttribute('role');
          el.removeAttribute('aria-label');
        }
      }
      aplicar();
      if(estreito.addEventListener){ estreito.addEventListener('change', aplicar); }
      else if(estreito.addListener){ estreito.addListener(aplicar); }
    }

    montar(document.querySelector('.passos'), 'Etapas do método — deslize para o lado');
    montar(document.querySelector('.cartoes'), 'Como eu trabalho — deslize para o lado');
  })();

  /* ==========================================================================
     Halo sob o dedo
     No desktop o halo do cartão segue o ponteiro. No toque, segue o dedo.
     ========================================================================== */
  (function haloToque(){
    if(pontoFino) return;
    document.querySelectorAll('[data-inclina]').forEach(function(el){
      function mover(e){
        var d = e.touches && e.touches[0];
        if(!d) return;
        var r = el.getBoundingClientRect();
        el.style.setProperty('--px', ((d.clientX - r.left) / r.width * 100) + '%');
        el.style.setProperty('--py', ((d.clientY - r.top) / r.height * 100) + '%');
      }
      el.addEventListener('touchstart', mover, { passive:true });
      el.addEventListener('touchmove', mover, { passive:true });
    });
  })();

  /* ---------- Ano ---------- */
  var ano = document.getElementById('ano');
  if(ano){ ano.textContent = new Date().getFullYear(); }
})();
