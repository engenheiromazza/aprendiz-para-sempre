/* Aprendiz para Sempre — Porta do Templo (Fase 2)
   Login (magic-link + Google) -> Telhamento -> Cadastro -> Painel */
(function () {
  "use strict";

  var cfg = window.APP_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL) {
    document.getElementById("loading").innerHTML =
      "<div class='app__card center'><p class='app__msg'>Erro de configuração. Recarregue a página.</p></div>";
    return;
  }
  var sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  var redirect = window.location.href.split("#")[0].split("?")[0];

  var VIEWS = ["loading", "view-login", "view-reset", "view-telhamento", "view-telhamento-fail", "view-cadastro", "view-painel", "view-quiz", "view-assinar"];
  function show(id) {
    VIEWS.forEach(function (v) {
      var el = document.getElementById(v);
      if (el) el.hidden = (v !== id);
    });
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var logoutBtn = document.getElementById("logoutBtn");

  /* ---------- Roteador ---------- */
  async function route() {
    show("loading");
    var sess = (await sb.auth.getSession()).data.session;
    if (!sess) { logoutBtn.style.display = "none"; return showLogin(); }
    logoutBtn.style.display = "";

    var profile = null;
    for (var i = 0; i < 4 && !profile; i++) {
      var res = await sb.from("profiles").select("*").eq("id", sess.user.id).maybeSingle();
      profile = res.data;
      if (!profile) await new Promise(function (r) { setTimeout(r, 600); });
    }
    if (!profile) return showLogin("Não consegui carregar seu perfil. Saia e entre novamente.");
    if (!profile.telhamento_ok) return startTelhamento();
    if (!profile.cadastro_completo) return show("view-cadastro");
    return showPainel(profile);
  }

  /* ---------- Login ---------- */
  function showLogin(msg) {
    show("view-login");
    var m = document.getElementById("loginMsg");
    if (m) m.textContent = msg || "";
  }
  // Login de teste por e-mail + senha (temporário, enquanto o e-mail/SMTP não está pronto)
  async function pwAuth(mode) {
    var email = document.getElementById("pwEmail").value.trim();
    var pass = document.getElementById("pwPass").value;
    var m = document.getElementById("loginMsg");
    if (!email || pass.length < 6) { m.textContent = "Informe e-mail e uma senha de ao menos 6 caracteres."; return; }
    m.textContent = mode === "signup" ? "Criando conta…" : "Entrando…";
    var r = mode === "signup"
      ? await sb.auth.signUp({ email: email, password: pass })
      : await sb.auth.signInWithPassword({ email: email, password: pass });
    if (r.error) { m.textContent = "Erro: " + r.error.message; return; }
    if (!r.data.session) { m.textContent = "Conta criada — agora clique em Entrar."; return; }
    // sucesso: onAuthStateChange (SIGNED_IN) chama route()
  }
  document.getElementById("pwLoginBtn").addEventListener("click", function () { pwAuth("login"); });
  document.getElementById("pwSignupBtn").addEventListener("click", function () { pwAuth("signup"); });

  // Esqueci minha senha
  var forgotLink = document.getElementById("forgotLink");
  if (forgotLink) forgotLink.addEventListener("click", async function (e) {
    e.preventDefault();
    var email = document.getElementById("pwEmail").value.trim();
    var m = document.getElementById("loginMsg");
    if (!email) { m.textContent = "Digite seu e-mail no campo acima e clique em 'Esqueci minha senha'."; return; }
    m.textContent = "Enviando…";
    var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.href.split("#")[0].split("?")[0] });
    m.textContent = r.error ? ("Erro: " + r.error.message) : "Se este e-mail estiver cadastrado, você receberá um link para redefinir a senha. (Confira o spam.)";
  });
  // Definir nova senha (após clicar no link de recuperação)
  var resetBtn = document.getElementById("resetBtn");
  if (resetBtn) resetBtn.addEventListener("click", async function () {
    var pass = document.getElementById("resetPass").value;
    var m = document.getElementById("resetMsg");
    if (pass.length < 6) { m.textContent = "A senha precisa ter ao menos 6 caracteres."; return; }
    m.textContent = "Salvando…";
    var r = await sb.auth.updateUser({ password: pass });
    if (r.error) { m.textContent = "Erro: " + r.error.message; return; }
    m.textContent = "Senha alterada! Entrando…";
    route();
  });

  /* ---------- Telhamento ---------- */
  var telQ = [], telI = 0, telAns = [], telTimer = null;

  async function startTelhamento() {
    show("view-telhamento");
    var box = document.getElementById("telhamentoBox");
    box.innerHTML = "<p class='app__msg'>Sorteando as perguntas…</p>";
    var r = await sb.rpc("telhamento_sortear");
    if (r.error || !r.data || !r.data.length) {
      box.innerHTML = "<p class='app__msg'>Erro ao carregar. Recarregue a página.</p>";
      return;
    }
    telQ = r.data; telI = 0; telAns = [];
    renderTel();
  }

  function renderTel() {
    if (telTimer) clearInterval(telTimer);
    var q = telQ[telI];
    var box = document.getElementById("telhamentoBox");
    var alts = q.alternativas.map(function (a, i) {
      return '<label class="tel-opt"><input type="radio" name="tel" value="' + i + '"><span>' + esc(a) + "</span></label>";
    }).join("");
    box.innerHTML =
      '<div class="tel-progress">Pergunta ' + (telI + 1) + " de " + telQ.length + "</div>" +
      '<div class="tel-timerbar"><span id="telBar"></span></div>' +
      '<p class="tel-question">' + esc(q.pergunta) + "</p>" +
      '<div class="tel-opts">' + alts + "</div>";

    box.querySelectorAll('input[name="tel"]').forEach(function (rd) {
      rd.addEventListener("change", function () { answerTel(parseInt(rd.value, 10)); });
    });

    var t = 30, bar = document.getElementById("telBar");
    bar.style.width = "100%";
    telTimer = setInterval(function () {
      t -= 0.1;
      if (bar) bar.style.width = Math.max(0, (t / 30) * 100) + "%";
      if (t <= 0) answerTel(-1);
    }, 100);
  }

  function answerTel(idx) {
    if (telTimer) clearInterval(telTimer);
    telAns.push({ id: telQ[telI].id, idx: idx });
    telI++;
    if (telI < telQ.length) renderTel();
    else finishTel();
  }

  async function finishTel() {
    var box = document.getElementById("telhamentoBox");
    box.innerHTML = "<p class='app__msg'>Conferindo…</p>";
    var r = await sb.rpc("telhamento_verificar", { p_respostas: telAns });
    if (r.error) { box.innerHTML = "<p class='app__msg'>Erro ao verificar. Tente novamente.</p>"; return; }
    if (r.data && r.data.ok) route();
    else show("view-telhamento-fail");
  }
  document.getElementById("telhamentoRetry").addEventListener("click", startTelhamento);

  /* ---------- Cadastro ---------- */
  document.getElementById("cadastroForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var f = e.target, m = document.getElementById("cadastroMsg");
    var fd = new FormData(f);
    var numero = fd.get("loja_numero");
    var params = {
      p_nome_completo: (fd.get("nome_completo") || "").trim(),
      p_nome_simbolico: (fd.get("nome_simbolico") || "").trim(),
      p_data_nascimento: fd.get("data_nascimento") || null,
      p_potencia: fd.get("potencia"),
      p_rito: fd.get("rito"),
      p_oriente_cidade: (fd.get("oriente_cidade") || "").trim(),
      p_estado_uf: fd.get("estado_uf") || null,
      p_loja_nome: (fd.get("loja_nome") || "").trim(),
      p_loja_numero: numero ? parseInt(numero, 10) : null,
      p_grau: fd.get("grau"),
      p_profissao: (fd.get("profissao") || "").trim(),
      p_opt_in_ranking: fd.get("opt_in_ranking") === "on"
    };
    if (!params.p_potencia || !params.p_rito || !params.p_grau) {
      m.textContent = "Selecione potência, rito e grau.";
      return;
    }
    m.textContent = "Salvando…";
    var r = await sb.rpc("salvar_cadastro", params);
    if (r.error) { m.textContent = "Erro: " + r.error.message; return; }
    route();
  });

  /* ---------- Painel / Hub ---------- */
  function activateTab(tab) {
    document.querySelectorAll(".hubtab").forEach(function (b) { b.classList.toggle("is-active", b.getAttribute("data-tab") === tab); });
    document.querySelectorAll(".hubpanel").forEach(function (p) { p.hidden = (p.id !== "tab-" + tab); });
  }
  document.querySelectorAll(".hubtab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var tab = btn.getAttribute("data-tab");
      activateTab(tab);
      if (tab === "ranking") loadRanking();
      if (tab === "pecas") renderPecas();
      if (tab === "duvidas") renderDuvidas();
    });
  });

  async function showPainel(profile) {
    show("view-painel");
    var n = document.getElementById("painelNome");
    if (n) n.textContent = profile.nome_simbolico || profile.nome_completo || "Irmão";
    activateTab("escada");
    await renderEscada();
  }

  async function renderPecas() {
    var box = document.getElementById("pecasBox");
    box.innerHTML = "<p class='app__msg'>Carregando…</p>";
    var r = await sb.rpc("escada_estado");
    if (r.error) { box.innerHTML = "<p class='app__msg'>—</p>"; return; }
    var aprov = r.data.degraus.filter(function (d) { return d.status === "aprovado"; });
    if (!aprov.length) {
      box.innerHTML = "<p class='app__lead'>Ao concluir cada degrau, você desbloqueia a <strong>peça de arquitetura</strong> daquela semana — para estudar e refletir. Conquiste seu primeiro degrau para começar sua coleção.</p>";
      return;
    }
    box.innerHTML = "<p class='app__lead'>As peças que você desbloqueou ao subir a Escada:</p>" +
      "<p class='peca-nota'>Produzidas com apoio de inteligência artificial e revisadas por um Mestre Maçom regular.</p>" +
      "<div class='pecas'>" + aprov.map(function (d) {
        return "<div class='peca' data-peca='" + d.numero + "' role='button' tabindex='0'>" +
          "<span class='peca__n'>" + d.numero + "º degrau</span>" +
          "<span class='peca__t'>" + (d.titulo ? esc(d.titulo) : "") + "</span>" +
          "<span class='peca__s'>ler ›</span></div>";
      }).join("") + "</div>";
    box.querySelectorAll("[data-peca]").forEach(function (el) {
      el.addEventListener("click", function () { abrirPeca(parseInt(el.getAttribute("data-peca"), 10)); });
    });
  }

  async function abrirPeca(degrau) {
    var box = document.getElementById("pecasBox");
    box.innerHTML = "<p class='app__msg'>Abrindo a peça…</p>";
    var r = await sb.rpc("peca_do_degrau", { p_degrau: degrau });
    if (r.error || !r.data || !r.data.conteudo) {
      box.innerHTML = "<p class='app__msg'>" + (r.error ? r.error.message : "Peça indisponível.") + "</p>";
      return;
    }
    box.innerHTML = "<button class='btn btn--ghost btn--sm' id='pecaVoltar'>‹ Voltar às peças</button>" +
      "<article class='peca-texto'>" + mdToHtml(r.data.conteudo) + "</article>" +
      "<p class='peca-nota'>Peça de arquitetura produzida com apoio de inteligência artificial e revisada por um Mestre Maçom regular.</p>";
    document.getElementById("pecaVoltar").addEventListener("click", renderPecas);
  }

  function mdToHtml(md) {
    var out = [], para = [];
    function flush() { if (para.length) { out.push("<p>" + para.join(" ") + "</p>"); para = []; } }
    String(md).split("\n").forEach(function (line) {
      var l = line.trim();
      if (l === "") { flush(); }
      else if (l === "---") { flush(); out.push("<hr>"); }
      else if (l.indexOf("### ") === 0) { flush(); out.push("<h4>" + esc(l.slice(4)) + "</h4>"); }
      else if (l.indexOf("## ") === 0) { flush(); out.push("<h3>" + esc(l.slice(3)) + "</h3>"); }
      else if (l.indexOf("# ") === 0) { flush(); out.push("<h3>" + esc(l.slice(2)) + "</h3>"); }
      else { para.push(esc(l)); }
    });
    flush();
    return out.join("");
  }

  /* ---------- Dúvidas e Sugestões ---------- */
  function renderDuvidas() {
    var box = document.getElementById("duvidasBox");
    box.innerHTML =
      "<p class='app__lead'>Tem uma dúvida, encontrou um problema ou quer sugerir algo? Escreva abaixo — eu leio todas as mensagens.</p>" +
      "<textarea id='fbTexto' class='fb-texto' rows='5' placeholder='Sua mensagem…'></textarea>" +
      "<button id='fbEnviar' class='btn btn--solid'>Enviar</button>" +
      "<p id='fbMsg' class='app__msg'></p>" +
      "<p class='peca-nota'>Prefere falar direto? Escreva para <a class='app__link' href='mailto:william@wmazza.com'>william@wmazza.com</a>.</p>" +
      "<div id='fbHist'></div>";
    document.getElementById("fbEnviar").addEventListener("click", enviarFeedback);
    carregarMinhasMensagens();
  }
  async function enviarFeedback() {
    var t = document.getElementById("fbTexto");
    var m = document.getElementById("fbMsg");
    var msg = (t.value || "").trim();
    if (msg.length < 3) { m.textContent = "Escreva uma mensagem um pouco maior."; return; }
    m.textContent = "Enviando…";
    var r = await sb.rpc("enviar_feedback", { p_mensagem: msg });
    if (r.error) { m.textContent = "Erro: " + r.error.message; return; }
    t.value = "";
    m.textContent = "Mensagem enviada, Irmão. Obrigado! 🔺";
    carregarMinhasMensagens();
  }
  async function carregarMinhasMensagens() {
    var hist = document.getElementById("fbHist");
    if (!hist) return;
    var r = await sb.rpc("minhas_mensagens");
    if (r.error || !r.data || !r.data.length) { hist.innerHTML = ""; return; }
    hist.innerHTML = "<p class='app__subtitle' style='font-size:1rem'>Suas mensagens</p>" +
      r.data.map(function (x) {
        var d = (x.criado_em || "").slice(0, 10);
        return "<div class='fb-item'><span class='fb-data'>" + esc(d) + "</span><p>" + esc(x.mensagem) + "</p></div>";
      }).join("");
  }

  async function renderEscada() {
    var box = document.getElementById("escadaBox");
    var info = document.getElementById("escadaInfo");
    box.innerHTML = "<p class='app__msg'>Carregando a Escada…</p>";
    var r = await sb.rpc("escada_estado");
    if (r.error) { box.innerHTML = "<p class='app__msg'>Erro ao carregar a Escada.</p>"; return; }
    var e = r.data;
    var concluidos = e.degraus.filter(function (d) { return d.status === "aprovado"; }).length;
    info.textContent = "Você conquistou " + concluidos + " de 33 degraus. Um novo degrau abre toda segunda-feira, 8h.";
    var labels = {
      aprovado: "concluído", disponivel: "▶ fazer agora", cooldown: "aguarde 24h",
      bloqueado_semana: "abre em breve", bloqueado_pago: "assine para acessar",
      bloqueado_anterior: "conclua o anterior"
    };
    var html = e.degraus.slice().reverse().map(function (d) {
      var lbl = d.status === "aprovado" && d.melhor_pontos != null ? ("✓ " + d.melhor_pontos + " pts") : (labels[d.status] || "");
      var attr = d.status === "disponivel" ? (" data-degrau='" + d.numero + "' role='button' tabindex='0'")
        : d.status === "bloqueado_pago" ? " data-assinar='1' role='button' tabindex='0'" : "";
      return "<div class='deg deg--" + d.status + "'" + attr + ">" +
        "<span class='deg__n'>" + d.numero + "º</span>" +
        "<span class='deg__label'>" + lbl + "</span>" +
        (d.numero <= 3 ? "<span class='deg__free'>grátis</span>" : "<span class='deg__free deg__free--hidden'>·</span>") +
        "</div>";
    }).join("");
    var banner = e.tem_acesso ? "" :
      "<div class='assinar-banner'><span>Você está no plano gratuito (degraus 1 a 3). Torne-se assinante para desbloquear até o 33º.</span><button id='bannerAssinar' class='btn btn--solid btn--sm'>Assinar</button></div>";
    box.innerHTML = banner + html;
    box.querySelectorAll("[data-degrau]").forEach(function (el) {
      el.addEventListener("click", function () { startQuiz(parseInt(el.getAttribute("data-degrau"), 10)); });
    });
    box.querySelectorAll("[data-assinar]").forEach(function (el) {
      el.addEventListener("click", showAssinar);
    });
    var ba = document.getElementById("bannerAssinar");
    if (ba) ba.addEventListener("click", showAssinar);
  }

  async function loadRanking() {
    var box = document.getElementById("rankingBox");
    box.innerHTML = "<p class='app__msg'>Carregando…</p>";
    var r = await sb.rpc("ranking_geral", { p_limit: 30 });
    if (r.error) { box.innerHTML = "<p class='app__msg'>—</p>"; return; }
    if (!r.data || !r.data.length) { box.innerHTML = "<p class='app__msg'>Ainda ninguém no ranking. Seja o primeiro!</p>"; return; }
    var graus = { aprendiz: "Aprendiz", companheiro: "Companheiro", mestre: "Mestre" };
    box.innerHTML = r.data.map(function (x, i) {
      var meta = [];
      if (x.loja_nome) meta.push(esc(x.loja_nome) + (x.loja_numero ? " nº " + x.loja_numero : ""));
      if (x.potencia) meta.push(esc(x.potencia));
      if (x.oriente_cidade) meta.push(esc(x.oriente_cidade) + (x.estado_uf ? "/" + esc(x.estado_uf) : ""));
      var grau = graus[x.grau] || "";
      return "<div class='rankrow'>" +
        "<span class='rankrow__pos'>" + (i + 1) + "º</span>" +
        "<div class='rankrow__main'>" +
          "<div class='rankrow__name'>" + esc(x.nome_simbolico || "—") +
            (grau ? " <span class='rankrow__grau'>" + grau + "</span>" : "") + "</div>" +
          "<div class='rankrow__meta'>" + meta.join(" · ") + "</div>" +
        "</div>" +
        "<div class='rankrow__score'><strong>" + x.total_pontos + " pts</strong>" +
          "<span>" + x.degraus_concluidos + (x.degraus_concluidos === 1 ? " degrau" : " degraus") + "</span></div>" +
      "</div>";
    }).join("");
  }

  /* ---------- Quiz da Escada ---------- */
  var qQ = [], qI = 0, qAns = [], qTimer = null, qDegrau = null, qStart = 0;

  async function startQuiz(degrau) {
    qDegrau = degrau;
    show("view-quiz");
    document.getElementById("quizDegrauLabel").textContent = "Degrau " + degrau + " — 10 questões, 60s cada, nota 100%";
    var box = document.getElementById("quizBox");
    box.innerHTML = "<p class='app__msg'>Preparando o questionário…</p>";
    var r = await sb.rpc("quiz_iniciar", { p_degrau: degrau });
    if (r.error || !r.data || !r.data.length) {
      box.innerHTML = "<p class='app__msg'>" + (r.error ? r.error.message : "Erro ao carregar.") + "</p>";
      addVoltar(box);
      return;
    }
    qQ = r.data; qI = 0; qAns = []; qStart = Date.now();
    renderQuiz();
  }

  function renderQuiz() {
    if (qTimer) clearInterval(qTimer);
    var q = qQ[qI];
    var box = document.getElementById("quizBox");
    var alts = q.alternativas.map(function (a, i) {
      return '<label class="tel-opt"><input type="radio" name="quiz" value="' + i + '"><span>' + esc(a) + "</span></label>";
    }).join("");
    box.innerHTML =
      '<div class="tel-progress">Questão ' + (qI + 1) + " de " + qQ.length + "</div>" +
      '<div class="tel-timerbar"><span id="quizBar"></span></div>' +
      '<p class="tel-question">' + esc(q.pergunta) + "</p>" +
      '<div class="tel-opts">' + alts + "</div>";
    box.querySelectorAll('input[name="quiz"]').forEach(function (rd) {
      rd.addEventListener("change", function () { answerQuiz(parseInt(rd.value, 10)); });
    });
    var t = 60, bar = document.getElementById("quizBar");
    bar.style.width = "100%";
    qTimer = setInterval(function () {
      t -= 0.1;
      if (bar) bar.style.width = Math.max(0, (t / 60) * 100) + "%";
      if (t <= 0) answerQuiz(-1);
    }, 100);
  }

  function answerQuiz(idx) {
    if (qTimer) clearInterval(qTimer);
    qAns.push({ id: qQ[qI].id, idx: idx });
    qI++;
    if (qI < qQ.length) renderQuiz();
    else finishQuiz();
  }

  async function finishQuiz() {
    var box = document.getElementById("quizBox");
    box.innerHTML = "<p class='app__msg'>Corrigindo…</p>";
    var tempo = Math.round((Date.now() - qStart) / 1000);
    var r = await sb.rpc("quiz_enviar", { p_degrau: qDegrau, p_respostas: qAns, p_tempo_seg: tempo });
    if (r.error) { box.innerHTML = "<p class='app__msg'>Erro: " + r.error.message + "</p>"; addVoltar(box); return; }
    var d = r.data;
    if (d.aprovado) {
      box.innerHTML = "<h2 class='app__title'>Subiu ao " + qDegrau + "º degrau! 🔺</h2>" +
        "<p class='app__lead'>Gabaritou! <strong>+" + d.pontos + " pontos.</strong> A pedra está mais lisa, Irmão.</p>";
    } else {
      var lista = (d.erradas || []).join(", ");
      box.innerHTML = "<h2 class='app__title'>Ainda não foi…</h2>" +
        "<p class='app__lead'>Você errou " + ((d.erradas || []).length === 1 ? "a questão " : "as questões ") + lista +
        ". Estude mais e refaça amanhã. Aqui, ou é 100%, ou volta à bancada. 🔨</p>";
    }
    addVoltar(box);
  }

  function addVoltar(box) {
    var b = document.createElement("button");
    b.className = "btn btn--ghost";
    b.textContent = "Voltar à Escada";
    b.addEventListener("click", function () { route(); });
    box.appendChild(b);
  }

  /* ---------- Assinatura (Asaas) ---------- */
  function showAssinar() {
    show("view-assinar");
    var m = document.getElementById("assinarMsg");
    if (m) m.textContent = "";
  }
  var assinarBtn = document.getElementById("assinarBtn");
  if (assinarBtn) assinarBtn.addEventListener("click", async function () {
    var sel = document.querySelector('input[name="plano"]:checked');
    var plano = sel ? sel.value : "mensal";
    var cpf = document.getElementById("assinarCpf").value;
    var m = document.getElementById("assinarMsg");
    m.textContent = "Gerando seu pagamento…";
    var r = await sb.functions.invoke("criar-assinatura", { body: { plano: plano, cpf: cpf } });
    if (r.error) {
      var msg = "Não foi possível gerar o pagamento.";
      try { if (r.error.context && r.error.context.json) { var b = await r.error.context.json(); if (b && b.error) msg = b.error; } } catch (_e) {}
      m.textContent = msg;
      return;
    }
    if (r.data && r.data.url) { window.location.href = r.data.url; return; }
    m.textContent = (r.data && r.data.error) ? r.data.error : "Não foi possível gerar o pagamento.";
  });
  var assinarVoltar = document.getElementById("assinarVoltar");
  if (assinarVoltar) assinarVoltar.addEventListener("click", function () { route(); });

  /* ---------- Sessão ---------- */
  logoutBtn.addEventListener("click", async function () {
    await sb.auth.signOut();
    route();
  });
  sb.auth.onAuthStateChange(function (event) {
    if (event === "PASSWORD_RECOVERY") { show("view-reset"); return; }
    if (event === "SIGNED_IN" || event === "SIGNED_OUT") route();
  });

  route();
})();
