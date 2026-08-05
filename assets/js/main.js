/* Aprendiz para Sempre — interações da landing (Fase 1) */
(function () {
  "use strict";

  /* Ano no rodapé */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* Menu mobile */
  var toggle = document.getElementById("navToggle");
  var links = document.getElementById("navLinks");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    links.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* Escada de Jacó — 33 degraus */
  var ladder = document.getElementById("ladder");
  if (ladder) {
    var steps = [1, 2, 3, 4, 5, "gap", 31, 32, 33];
    var frag = document.createDocumentFragment();
    steps.forEach(function (i) {
      var rung = document.createElement("div");
      if (i === "gap") {
        rung.className = "rung rung--gap";
        rung.innerHTML = "<span>⋯</span>";
      } else {
        rung.className = "rung";
        var tag = "";
        if (i <= 3) { rung.className += " rung--free"; tag = "Grátis"; }
        if (i === 33) { rung.className += " rung--top"; tag = "Certificado"; }
        rung.innerHTML = '<span class="rung__n">' + i + "º</span>" +
          (tag ? '<span class="rung__tag">' + tag + "</span>" : "");
      }
      frag.appendChild(rung);
    });
    ladder.appendChild(frag);
  }

  /* Toast para ações ainda não disponíveis (login chega na Fase 2) */
  var toast = document.getElementById("toast");
  var toastTimer = null;
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 3600);
  }

  document.querySelectorAll("[data-login]").forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      showToast("Em breve, Irmão — estamos levantando as colunas do Templo. 🔨");
    });
  });

  /* Contador de obreiros (maçons cadastrados) — some se falhar ou não houver ninguém */
  var cfg = window.APP_CONFIG || {};
  var obreirosSec = document.getElementById("obreiros");
  var obreirosOut = document.getElementById("obreirosCount");
  if (cfg.SUPABASE_URL && obreirosSec && obreirosOut) {
    fetch(cfg.SUPABASE_URL + "/rest/v1/rpc/contar_obreiros", {
      method: "POST",
      headers: {
        "apikey": cfg.SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + cfg.SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
      },
      body: "{}"
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (n) {
      n = parseInt(n, 10);
      if (!n || n < 1) return;
      obreirosSec.hidden = false;
      var dur = 1100, t0 = null;
      function step(ts) {
        if (t0 === null) t0 = ts;
        var p = Math.min((ts - t0) / dur, 1);
        obreirosOut.textContent = Math.round(p * n).toLocaleString("pt-BR");
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }).catch(function () {});
  }
})();
