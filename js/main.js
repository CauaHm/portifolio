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
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var pontos = [], larg = 0, alt = 0;
    var pt = { x:-9999, y:-9999 };
    var cor = [242,240,234];
    var laco = null, visivel = true;

    var ESPACO = 44, RAIO = 135, FORCA = 24;

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

    function desenhar(){
      ctx.clearRect(0, 0, larg, alt);
      var base = 'rgb(' + cor[0] + ',' + cor[1] + ',' + cor[2] + ')';
      for(var k = 0; k < pontos.length; k++){
        var p = pontos[k];
        var dx = p.ox - pt.x, dy = p.oy - pt.y;
        var d = Math.hypot(dx, dy);
        var ax = p.ox, ay = p.oy, brilho = .2;
        if(d < RAIO){
          var f = 1 - d / RAIO, ang = Math.atan2(dy, dx);
          ax = p.ox + Math.cos(ang) * f * FORCA;
          ay = p.oy + Math.sin(ang) * f * FORCA;
          brilho = .2 + f * .8;
        }
        p.x += (ax - p.x) * .12;
        p.y += (ay - p.y) * .12;
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
    menuToggle.addEventListener('click', function(){
      var aberto = navLinks.classList.toggle('aberto');
      menuToggle.setAttribute('aria-expanded', aberto ? 'true' : 'false');
      menuToggle.textContent = aberto ? '✕' : '☰';
    });
    navLinks.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', function(){
        navLinks.classList.remove('aberto');
        menuToggle.setAttribute('aria-expanded','false');
        menuToggle.textContent = '☰';
      });
    });
  }

  /* ---------- Ano ---------- */
  var ano = document.getElementById('ano');
  if(ano){ ano.textContent = new Date().getFullYear(); }
})();
