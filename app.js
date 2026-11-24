(function () {
  "use strict";
  const D = window.GAME_DATA,
    E = window.OracleGame,
    main = document.querySelector("#app"),
    dialog = document.querySelector("#reader"),
    reading = document.querySelector("#reading"),
    continueButton = document.querySelector("#continue"),
    pauseDialog = document.querySelector("#pause-menu");
  let pausePanel = "home";
  let historyVisible = true;
  let readingSuspended = false,
    suspendedReadingScroll = 0,
    suspendedDialogScroll = 0;
  let lang = "pt",
    volume = 1,
    view = "intro",
    engine = null,
    locked = false,
    afterReading = null,
    aiTimer = null,
    paused = false,
    quipIndex = Math.floor(Math.random() * D.quips.pt.length),
    riskBag = [],
    tutorialPage = 0,
    lastCard = null;
  let introIndex = 0,
    introTime = 0;
  let introStarted = false,
    audioUnlocked = false,
    lastTypingSound = 0;
  let damageUntil = 0,
    damageTimer = null;
  const flashLayer = document.createElement("div");
  flashLayer.id = "screen-flash";
  flashLayer.setAttribute("aria-hidden", "true");
  document.body.append(flashLayer);
  function introStep() {
    if (!introStarted) {
      introStarted = true;
      introTime = 0;
      updateIntro();
      return;
    }
    if (introIndex < D.intro[lang].length) {
      introIndex = D.intro[lang].length;
      updateIntro();
    } else screen("menu");
  }
  function updateIntro() {
    const text = main.querySelector("#intro-text");
    if (!text) return;
    const complete = introIndex >= D.intro[lang].length;
    const visible = D.intro[lang].slice(0, introIndex);
    text.innerHTML = visible
      .split("\n")
      .map((paragraph) => {
        const tone = /^(\[|ALERTA|CRITICAL|VOCÊ|YOU)/.test(paragraph)
          ? "heading"
          : /LGPD|GDPR|Ator-Rede|Actor-Network/.test(paragraph)
            ? "theme"
            : /Oráculo Velado|colapso|collapse/.test(paragraph)
              ? "warning"
              : "body";
        return `<span class="intro-tone-${tone}">${esc(paragraph)}</span>`;
      })
      .join("\n");
    main.querySelector(".intro-frame").dataset.complete = complete;
    main.querySelector(".intro-frame").dataset.started = introStarted;
    if (!introStarted) {
      main.querySelector("#intro-hint").textContent = tr(
        "CLIQUE OU PRESSIONE ESPAÇO PARA INICIAR COM SOM",
        "CLICK OR PRESS SPACE TO START WITH SOUND",
      );
      main.querySelector('[data-action="intro-action"]').textContent = tr(
        "INICIAR INTRODUÇÃO",
        "START INTRODUCTION",
      );
      return;
    }
    main.querySelector("#intro-hint").textContent = complete
      ? tr(
          ">>> PRESSIONE ESPAÇO OU CLIQUE PARA AVANÇAR <<<",
          ">>> PRESS SPACE OR CLICK TO CONTINUE <<<",
        )
      : tr("[ESPAÇO / CLIQUE: REVELAR TUDO]", "[SPACE / CLICK: REVEAL ALL]");
    main.querySelector('[data-action="intro-action"]').textContent = complete
      ? tr("ACESSAR CENTRAL [ENTRAR]", "ACCESS CENTRAL [ENTER]")
      : tr("PULAR INTRODUÇÃO", "SKIP INTRODUCTION");
  }
  const sounds = {};
  for (const name of [
    "click",
    "success",
    "error",
    "item",
    "typing",
    "ambient_drone",
  ]) {
    sounds[name] = new Audio("assets/audio/" + name + ".wav");
    sounds[name].preload = "auto";
  }
  sounds.ambient_drone.loop = true;
  function english() {
    return lang === "en";
  }
  function tr(pt, en) {
    return english() ? en : pt;
  }
  function esc(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }
  function actor(n) {
    return n === 0 ? tr("Você", "You") : "Oráculo Velado";
  }
  function sound(name) {
    if (!audioUnlocked || paused || volume === 0) return;
    if (pauseDialog.open && name !== "click") return;
    const audio = sounds[name];
    audio.volume = volume * 0.8 * (name === "ambient_drone" ? 0.28 : 1);
    if (name !== "ambient_drone") audio.currentTime = 0;
    audio.play().catch(() => {});
  }
  function activate(fromGesture = false) {
    if (fromGesture) audioUnlocked = true;
    if (!paused && !pauseDialog.open && volume) sound("ambient_drone");
  }
  function damageFeedback() {
    damageUntil = performance.now() + 1200;
    clearTimeout(damageTimer);
    document.body.classList.remove("damage-feedback");
    void document.body.offsetWidth;
    document.body.classList.add("damage-feedback");
    damageTimer = setTimeout(
      () => document.body.classList.remove("damage-feedback"),
      380,
    );
  }
  function button(id, text, kind = "") {
    return (
      '<button data-action="' +
      id +
      '" class="' +
      kind +
      '">' +
      text +
      "</button>"
    );
  }
  function fullscreenButton() {
    return document.fullscreenEnabled
      ? button(
          "fullscreen",
          document.fullscreenElement
            ? tr("Sair da tela cheia", "Exit fullscreen")
            : tr("Tela cheia", "Fullscreen"),
        )
      : "";
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      if (pauseDialog.open) {
        pauseDialog.querySelector('[role="status"]').textContent = tr(
          "O navegador não permitiu ativar a tela cheia.",
          "The browser did not allow fullscreen.",
        );
        return;
      }
      show(
        "<p>" +
          tr(
            "Seu navegador não permitiu ativar a tela cheia. Você pode continuar jogando normalmente.",
            "Your browser did not allow fullscreen. You can keep playing normally.",
          ) +
          "</p>",
      );
    }
  }
  function heading(title) {
    if (view === "game")
      return (
        '<header class="bar"><h1>' +
        esc(title) +
        '</h1><div class="header-actions">' +
        button("pause", tr("MENU / PAUSAR", "MENU / PAUSE"), "pause-access") +
        "</div></header>"
      );
    return (
      '<header class="bar"><h1>' +
      esc(title) +
      "</h1>" +
      '<div class="header-actions">' +
      fullscreenButton() +
      button("settings", tr("Configurações", "Settings")) +
      button("menu", tr("Menu", "Menu")) +
      "</div>" +
      "</header>"
    );
  }
  function lesson(id) {
    return D.cards[id][english() ? 1 : 0];
  }
  function lessonHtml(id) {
    const l = lesson(id);
    return (
      "<h2>" +
      esc(l.title) +
      "</h2><small>" +
      tr(
        l.source ? "Exemplo documentado" : "Situação ilustrativa",
        l.source ? "Documented example" : "Illustrative scenario",
      ) +
      "</small><p>" +
      esc(l.scenario) +
      "</p>" +
      (l.network
        ? "<h3>" +
          tr(
            "Como a decisão se espalha (ANT)",
            "How the decision spreads (ANT)",
          ) +
          "</h3><p>" +
          esc(l.network) +
          "</p><h3>" +
          tr("Para discutir em sala", "Discuss with your class") +
          "</h3><p>" +
          esc(l.question) +
          "</p>"
        : "") +
      "<h3>" +
      tr("O que você pode fazer", "What you can do") +
      "</h3><p>" +
      esc(l.precaution) +
      "</p>" +
      (l.source ? '<p class="source">' + esc(l.source) + "</p>" : "")
    );
  }
  function resultBanner(card, preview) {
    const safe = card === "S";
    const symbol = safe
      ? '<path d="M24 4 41 11v13c0 11-17 20-17 20S7 35 7 24V11Z"/><path d="m15 24 6 6 13-14"/>'
      : '<path d="M24 6 45 42H3Z"/><path d="M24 18v11m0 6v1"/>';
    return `<section class="audit-result" role="status"><svg viewBox="0 0 48 48" aria-hidden="true">${symbol}</svg><div><p class="audit-result-label">${preview ? tr("AUDITORIA · PRÓXIMA CARTA", "AUDIT · NEXT CARD") : tr("RESULTADO · CARTA REVELADA", "RESULT · REVEALED CARD")}</p><h2>${safe ? tr("DECISÃO SEGURA", "SAFE DECISION") : tr("DECISÃO DE RISCO", "RISKY DECISION")}</h2><p>${preview ? tr("A carta continua no lote. A auditoria apenas revelou seu tipo.", "The card remains in the batch. The audit only revealed its type.") : safe ? tr("Esta carta não causa perda de integridade.", "This card causes no integrity loss.") : tr("Esta carta reduz a integridade do sistema testado.", "This card reduces the tested system’s integrity.")}</p></div></section>`;
  }
  function show(content, callback = null, newspaper = false, result = null) {
    dialog.querySelector(".reading-navigation").hidden = view !== "game";
    dialog.querySelector("#reading-pause").textContent = tr(
      "Menu / Pausar",
      "Menu / Pause",
    );
    if (result) dialog.dataset.result = result.card === "S" ? "safe" : "risk";
    else delete dialog.dataset.result;
    reading.innerHTML =
      (result ? resultBanner(result.card, result.preview) : "") + content;
    dialog.classList.toggle("newspaper", newspaper);
    continueButton.textContent = newspaper
      ? tr("Fechar jornal", "Close newspaper")
      : tr("Continuar", "Continue");
    afterReading = callback;
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    reading.scrollTop = 0;
  }
  function closeReading() {
    if (!dialog.open) return;
    clearTimeout(damageTimer);
    document.body.classList.remove("damage-feedback");
    dialog.close();
    const fn = afterReading;
    afterReading = null;
    if (fn) fn();
  }
  continueButton.addEventListener("click", closeReading);
  dialog
    .querySelector("#reading-pause")
    .addEventListener("click", () => openPause());
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    if (view === "game") openPause();
    else closeReading();
  });
  function renderPause(panel = "home") {
    pausePanel = panel;
    const back =
      panel === "home"
        ? ""
        : button(
            "pause-home",
            tr("← Voltar à pausa", "← Back to pause"),
            "pause-back",
          );
    const breadcrumb =
      tr("PARTIDA PAUSADA", "GAME PAUSED") +
      (panel === "home"
        ? ""
        : " / " +
          (panel === "restart"
            ? tr("REINICIAR", "RESTART")
            : tr("CONFIGURAÇÕES", "SETTINGS")));
    let content;
    if (panel === "restart") {
      content =
        '<h2 id="pause-title">' +
        tr("Reiniciar esta partida?", "Restart this match?") +
        '</h2><p class="pause-description">' +
        tr(
          "O progresso desta partida será apagado. Você e o Oráculo voltarão a 5 de integridade, com um novo lote de decisões.",
          "This match’s progress will be cleared. You and the Oracle will return to 5 integrity, with a new batch of decisions.",
        ) +
        '</p><div class="pause-confirm-actions">' +
        button("pause-home", tr("Cancelar", "Cancel")) +
        button(
          "confirm-restart",
          tr("Sim, reiniciar partida", "Yes, restart match"),
          "danger",
        ) +
        "</div>";
    } else if (panel === "settings") {
      content =
        '<h2 id="pause-title">' +
        tr("Configurações da partida", "Match settings") +
        '</h2><label class="pause-volume-label" for="pause-volume">' +
        tr("Volume geral", "Master volume") +
        ' <output id="pause-volume-label">' +
        Math.round(volume * 100) +
        '%</output></label><input id="pause-volume" type="range" min="0" max="100" value="' +
        Math.round(volume * 100) +
        '">' +
        fullscreenButton() +
        '<p role="status" class="pause-status"></p>' +
        button("resume", tr("Continuar partida", "Resume match"), "good");
    } else {
      content =
        '<h2 id="pause-title">' +
        tr("Uma pausa na auditoria", "An audit break") +
        '</h2><p class="pause-description">' +
        tr(
          "A partida fica parada enquanto este menu estiver aberto.",
          "The match stays paused while this menu is open.",
        ) +
        '</p><nav class="pause-options" aria-label="' +
        tr("Opções de pausa", "Pause options") +
        '">' +
        button("resume", tr("Continuar partida", "Resume match"), "good") +
        button("pause-settings", tr("Configurações", "Settings")) +
        button("restart", tr("Reiniciar partida", "Restart match")) +
        button(
          "main-menu",
          tr("Voltar ao menu principal", "Back to main menu"),
        ) +
        '</nav><p class="pause-note">' +
        tr(
          "Ao voltar ao menu principal, você poderá retomar esta partida em Continuar partida.",
          "From the main menu, you can return to this match with Continue match.",
        ) +
        "</p>";
    }
    pauseDialog.innerHTML =
      '<div class="pause-breadcrumb">' +
      breadcrumb +
      "</div>" +
      back +
      content +
      '<footer class="pause-help">' +
      tr(
        "Esc: voltar · Tab ou ↑ ↓: navegar · Enter: selecionar",
        "Esc: back · Tab or ↑ ↓: navigate · Enter: select",
      ) +
      "</footer>";
    if (pauseDialog.open)
      pauseDialog
        .querySelector(
          panel === "restart"
            ? '.pause-confirm-actions [data-action="pause-home"]'
            : panel === "home"
              ? '[data-action="resume"]'
              : ".pause-back",
        )
        .focus();
  }
  function openPause(panel = "home") {
    if (view !== "game" || pauseDialog.open) return;
    cancelAI();
    clearTimeout(damageTimer);
    document.body.classList.remove("damage-feedback");
    for (const audio of Object.values(sounds)) audio.pause();
    renderPause(panel);
    pauseDialog.showModal();
    pauseDialog
      .querySelector(
        panel === "restart"
          ? '.pause-confirm-actions [data-action="pause-home"]'
          : '[data-action="resume"]',
      )
      .focus();
  }
  function resumeMatch() {
    pauseDialog.close();
    activate();
    scheduleAI();
  }
  function leaveReading() {
    // Sair para o menu ou reiniciar não pode executar a próxima jogada.
    afterReading = null;
    readingSuspended = false;
    if (dialog.open) dialog.close();
    locked = false;
  }
  pauseDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    if (pausePanel === "home") resumeMatch();
    else renderPause();
  });
  pauseDialog.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target || target.disabled) return;
    sound("click");
    const action = target.dataset.action;
    if (action === "resume") resumeMatch();
    else if (action === "pause-home") renderPause();
    else if (action === "pause-settings") renderPause("settings");
    else if (action === "restart") renderPause("restart");
    else if (action === "confirm-restart") {
      pauseDialog.close();
      leaveReading();
      newGame();
    } else if (action === "main-menu") {
      pauseDialog.close();
      if (dialog.open) {
        readingSuspended = true;
        suspendedReadingScroll = reading.scrollTop;
        suspendedDialogScroll = dialog.scrollTop;
        dialog.close();
      }
      screen("menu");
      main.querySelector('[data-action="play"]')?.focus();
    } else if (action === "fullscreen") toggleFullscreen();
  });
  pauseDialog.addEventListener("input", (event) => {
    if (event.target.id !== "pause-volume") return;
    volume = Number(event.target.value) / 100;
    pauseDialog.querySelector("#pause-volume-label").textContent =
      Math.round(volume * 100) + "%";
    for (const [name, audio] of Object.entries(sounds))
      audio.volume = volume * 0.8 * (name === "ambient_drone" ? 0.28 : 1);
  });
  pauseDialog.addEventListener("keydown", (event) => {
    if (
      event.target.matches("input") ||
      !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)
    )
      return;
    event.preventDefault();
    const items = [
      ...pauseDialog.querySelectorAll("button:not(:disabled),input"),
    ];
    const current = items.indexOf(document.activeElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
            items.length;
    items[next]?.focus();
  });
  document.addEventListener("fullscreenchange", () => {
    if (pauseDialog.open && pausePanel === "settings") renderPause("settings");
  });
  function cancelAI() {
    if (aiTimer !== null) clearTimeout(aiTimer);
    aiTimer = null;
  }
  function screen(next) {
    cancelAI();
    view = next;
    render();
    if (next === "game") {
      if (readingSuspended) {
        readingSuspended = false;
        dialog.showModal();
        reading.scrollTop = suspendedReadingScroll;
        dialog.scrollTop = suspendedDialogScroll;
      }
      scheduleAI();
    }
  }
  function render() {
    document.documentElement.lang = english() ? "en" : "pt-BR";
    document.body.dataset.view = view;
    if (view === "intro") {
      main.innerHTML = `<section class="intro-frame" aria-label="${tr("Introdução", "Introduction")}">
        <h1>${tr("[ SISTEMA DE AUDITORIA ÉTICA ]", "[ ETHICAL AUDIT SYSTEM ]")}</h1>
        <p class="intro-status">${tr("LINK ATIVO // CONEXÃO COM O NÚCLEO ESTABELECIDA", "LINK ACTIVE // CORE CONNECTION ESTABLISHED")}</p>
        <div class="intro-screen"><span class="intro-welcome">${tr("Clique ou pressione Espaço para iniciar a conexão com som.", "Click or press Space to begin the connection with sound.")}</span><span id="intro-text"></span><span class="intro-cursor" aria-hidden="true">▌</span></div>
        <p id="intro-hint"></p>${button("intro-action", tr("PULAR INTRODUÇÃO", "SKIP INTRODUCTION"))}
      </section>`;
      updateIntro();
      return;
    }
    if (view === "menu") {
      main.innerHTML =
        '<section class="menu"><h1>ORÁCULO VELADO</h1><p>' +
        tr(
          "DUELO DE RISCO E ÉTICA EM INTELIGÊNCIA ARTIFICIAL",
          "A DUEL OF RISK AND ETHICS IN ARTIFICIAL INTELLIGENCE",
        ) +
        '</p><div class="module-legend"><span class="safe">' +
        tr("SEGURA", "SAFE") +
        '</span><span class="risky">' +
        tr("DE RISCO", "RISKY") +
        "</span></div><nav>" +
        button(
          "play",
          tr(
            engine && !engine.over ? "Continuar partida" : "Jogar",
            engine && !engine.over ? "Continue match" : "Play",
          ),
          "good",
        ) +
        button("tutorial", tr("Como jogar", "How to play")) +
        button("story", tr("História", "Story")) +
        button("collection", tr("Coleção", "Collection")) +
        button("settings", tr("Configurações", "Settings")) +
        button("credits", tr("Créditos", "Credits")) +
        fullscreenButton() +
        '<a class="guide-link" href="guia.pdf" target="_blank" rel="noopener">' +
        tr("Guia e fontes", "Guide and sources") +
        "</a></nav><small>V1.0 // AUDIT LAB // WEB</small></section>";
      return;
    }
    if (view === "story") {
      main.innerHTML =
        heading(tr("História", "Story")) +
        '<section class="panel"><p>' +
        esc(D.intro[lang]).replace(/\n/g, "<br>") +
        "</p></section>";
      return;
    }
    if (view === "settings") {
      main.innerHTML =
        heading(tr("Configurações", "Settings")) +
        '<section class="panel"><label>' +
        tr("Volume", "Volume") +
        ' <output id="volume-label">' +
        Math.round(volume * 100) +
        '%</output><input id="volume" aria-label="Volume" type="range" min="0" max="100" value="' +
        volume * 100 +
        '"></label><div class="actions">' +
        button("pt", "Português") +
        button("en", "English") +
        "</div><p>" +
        tr(
          "Jogue com o mouse ou pelo toque. A tela cheia pode ser ativada pelo botão abaixo.",
          "Play with a mouse or touch. Use the button below to enter fullscreen.",
        ) +
        "</p>" +
        fullscreenButton() +
        "</section>";
      return;
    }
    if (view === "credits") {
      const c = D.credits;
      main.innerHTML =
        heading(tr("Créditos", "Credits")) +
        '<section class="panel"><h2>' +
        tr("Desenvolvimento", "Development") +
        "</h2><p>" +
        c.developers.map(esc).join("<br>") +
        "</p><h3>" +
        tr("Disciplina", "Course") +
        "</h3><p>" +
        esc(c.course) +
        "</p><h3>" +
        tr("Professora", "Professor") +
        "</h3><p>" +
        esc(c.teacher) +
        "</p><p>" +
        esc(c.institution) +
        "</p><h3>" +
        tr("Tecnologias", "Technologies") +
        "</h3><p>HTML, CSS e JavaScript</p><h3>" +
        tr(
          "Inspiração e referências educativas",
          "Inspiration and educational references",
        ) +
        "</h3><p>" +
        tr(
          "Buckshot Roulette — Mike Klubnika. Teoria Ator-Rede — Bruno Latour. As fontes dos casos documentados estão identificadas nas cartas e reunidas no guia do jogo.",
          "Buckshot Roulette — Mike Klubnika. Actor-Network Theory — Bruno Latour. Sources for documented cases are identified on the cards and collected in the game guide.",
        ) +
        "</p></section>";
      return;
    }
    if (view === "tutorial") {
      const pages = D.tutorial[lang],
        p = pages[tutorialPage];
      main.innerHTML =
        heading(tr("Como jogar", "How to play")) +
        '<section class="panel"><small>' +
        tr("ETAPA ", "STEP ") +
        (tutorialPage + 1) +
        " / " +
        pages.length +
        "</small><h2>" +
        esc(p[0]) +
        '</h2><img class="tutorial-image" alt="' +
        esc(p[0]) +
        '" src="assets/tutorial/' +
        lang +
        "-" +
        (tutorialPage + 1) +
        '.png">' +
        p[1].map((t) => "<p>" + esc(t) + "</p>").join("") +
        "</section><div class='actions'>" +
        (tutorialPage
          ? button("previous", tr("Anterior", "Previous"))
          : "<span></span>") +
        (tutorialPage < pages.length - 1
          ? button("next", tr("Próximo", "Next"))
          : "<span></span>") +
        "</div>";
      return;
    }
    if (view === "collection") {
      main.innerHTML =
        heading(tr("Coleção · 30 cartas", "Collection · 30 cards")) +
        '<div class="grid">' +
        Object.keys(D.cards)
          .map(
            (id) =>
              '<button data-card="' +
              id +
              '">' +
              esc(lesson(id).title) +
              "<small>" +
              (D.safe.includes(id)
                ? tr("Segura", "Safe")
                : tr("De risco", "Risky")) +
              "</small></button>",
          )
          .join("") +
        "</div>";
      return;
    }
    if (view === "game") renderGame();
  }
  function integrity(hp, type) {
    const bolt =
      '<svg viewBox="0 0 26 32" aria-hidden="true"><path d="M14 2 3 18h8L8 30l15-18h-9l4-10Z"/></svg>';
    return `<div class="integrity ${type}" role="img" aria-label="${tr("Integridade", "Integrity")}: ${hp}/5">${Array.from({ length: 5 }, (_, i) => `<span class="${i < hp ? "filled" : ""}">${bolt}</span>`).join("")}<b aria-hidden="true">[${hp}/5]</b></div>`;
  }
  function renderGame() {
    lastFrame = -1;
    const player = engine.actors[0],
      oracle = engine.actors[1];
    const safe = engine.deck.filter((card) => card === "S").length;
    const risky = engine.deck.length - safe;
    const active = !locked && !engine.over && engine.turn === 0;
    const status = engine.over
      ? tr("SESSÃO ENCERRADA", "SESSION ENDED")
      : active
        ? tr(
            "SEU TURNO: ESCOLHA UMA AÇÃO OU FERRAMENTA",
            "YOUR TURN: CHOOSE AN ACTION OR TOOL",
          )
        : tr(
            "TURNO DO ORÁCULO: PROCESSANDO DECISÕES...",
            "ORACLE TURN: PROCESSING DECISIONS...",
          );
    const quip =
      engine.turn === 1 && !engine.over
        ? D.quips[lang][quipIndex % D.quips[lang].length][
            Math.min(1, oracle.used.length)
          ]
        : tr(
            "O monitor observa sua próxima decisão.",
            "The monitor watches your next decision.",
          );
    const labels = {
      LUPA: "LUPA",
      LGPD: "LGPD",
      INJECAO_PROMPT: "2X",
      HUMAN_IN_THE_LOOP: "HUMAN",
      ANTI_DDOS: "DDoS",
    };
    main.dataset.turn = engine.turn;
    const shortNames = {
      LUPA: tr("Auditoria", "Audit"),
      LGPD: tr("Proteção", "Protection"),
      INJECAO_PROMPT: tr("Sobrecarga", "Overload"),
      HUMAN_IN_THE_LOOP: tr("Descarte", "Discard"),
      ANTI_DDOS: tr("Bloqueio", "Block"),
    };
    main.innerHTML =
      heading(tr("CÂMARA DE AUDITORIA", "AUDIT CHAMBER")) +
      `
      <div class="chamber"><section class="table">
        <div class="table-top">
          <div class="score"><h2>${tr("VOCÊ (OPERADOR)", "YOU (OPERATOR)")}</h2>${integrity(player.hp, "player")}</div>
          <div class="oracle" role="img" aria-label="Oráculo Velado"></div>
          <div class="score"><h2>ORÁCULO VELADO</h2>${integrity(oracle.hp, "opponent")}</div>
        </div>
        <p class="quip ${engine.turn === 1 && !engine.over ? "speaking" : ""}">${esc(quip)}</p><div class="oracle-tools">${oracle.used.map((tool) => `<span>${labels[tool]}</span>`).join("")}</div>
        <p class="status">&gt;&gt;&gt; ${status} &lt;&lt;&lt;</p>
        <section class="panel buffer"><h2>${tr("PAINEL DO BUFFER", "BUFFER PANEL")} · ${tr("LOTE", "BATCH")} #${engine.batch}</h2>
          <div class="buffer-content"><dl><div><dt>${tr("Decisões no lote", "Decisions in batch")}</dt><dd>${engine.deck.length}</dd></div>
          <div><dt>${tr("Decisões seguras", "Safe decisions")}</dt><dd class="safe">${safe}</dd></div>
          <div><dt>${tr("Decisões de risco", "Risky decisions")}</dt><dd class="risky">${risky}</dd></div>
          <div><dt>${tr("Risco estimado", "Estimated risk")}</dt><dd class="risk">${Math.round((risky / engine.deck.length) * 100) || 0}%</dd></div></dl>
          <div class="deck"><small>${tr("DECISÕES EM ORDEM OCULTA", "DECISIONS IN HIDDEN ORDER")}</small><div>${engine.deck.map(() => '<span class="hidden-card">?</span>').join("")}</div></div></div>
        </section>
        <div class="actions decision-actions"><div>${button("self", tr("AUTO-IMPLEMENTAR [EM MIM]", "SELF-IMPLEMENT [ON ME]"), "good")}<small>${tr("Segura = turno extra · De risco = perde integridade", "Safe = extra turn · Risky = lose integrity")}</small></div><div>${button("audit", tr("AUDITAR O ORÁCULO", "AUDIT THE ORACLE"), "danger")}<small>${tr("De risco = Oráculo perde integridade", "Risky = Oracle loses integrity")}</small></div></div>
        <section class="panel workbench"><h2>${tr("FERRAMENTAS NA BANCADA", "TOOLS ON THE TABLE")} (${player.inventory.length}/8)</h2>
          <div class="tool-counter">${tr("Usadas neste turno", "Used this turn")}: <b>${player.used.length}/2</b> · ${tr("até duas ferramentas diferentes", "up to two different tools")}</div>
          <div class="inventory">${player.inventory.map((tool, index) => `<button data-tool="${index}" title="${esc(D.tools[tool][english() ? 1 : 0][1])}" ${!active || player.used.length >= 2 || player.used.includes(tool) || (tool === "ANTI_DDOS" && oracle.blocked) ? "disabled" : ""}><strong>[${labels[tool]}]</strong> ${esc(shortNames[tool])}</button>`).join("")}</div>
          <div class="workbench-notices" data-empty="${!player.inventory.length}">
            ${!player.inventory.length ? `<p>${tr("Bancada vazia. Novas ferramentas chegam no próximo lote.", "Empty table. New tools arrive with the next batch.")}</p>` : ""}
            ${engine.multiplier > 1 ? `<p class="risky">${tr("INJEÇÃO DE PROMPT ATIVA: PRÓXIMA FALHA 2X", "PROMPT INJECTION ACTIVE: NEXT FAILURE 2X")}</p>` : ""}
          </div>
          ${engine.over ? `<div class="actions">${button("journal", tr("LER JORNAL", "READ NEWSPAPER"))}${button("new", tr("NOVA PARTIDA", "NEW MATCH"))}</div>` : ""}
          <p class="tool-description">${tr("Passe o cursor sobre uma ferramenta para visualizar seus metadados.", "Hover over a tool to view its details.")}</p>
        </section>
      </section><section class="history-region" aria-labelledby="history-title">
      <header class="history-toolbar"><h2 id="history-title">${tr("Console (Histórico)", "Console (History)")}</h2><button data-action="toggle-history" aria-controls="match-history" aria-expanded="${historyVisible}">${historyVisible ? tr("Ocultar histórico", "Hide history") : tr("Mostrar histórico", "Show history")}</button></header>
      <p class="history-hint" id="history-help">${tr("Histórico das rodadas: decisões reveladas e ferramentas usadas por você e pelo Oráculo.", "Round history: decisions revealed and tools used by you and the Oracle.")}</p>
      <aside id="match-history" class="panel console" aria-labelledby="history-title" aria-describedby="history-help" ${historyVisible ? "" : "hidden"}><div class="log" aria-live="polite"><p>${tr("[ CÂMARA DE AUDITORIA INICIALIZADA ]", "[ AUDIT CHAMBER INITIALIZED ]")}</p>${engine.events
        .map(
          (event) =>
            `<p class="${event.type === "card" ? (event.card === "R" ? "risky" : "safe") : ""}">${esc(eventText(event))}</p>`,
        )
        .join(
          "",
        )}</div></aside><p class="history-hidden-note" ${historyVisible ? "hidden" : ""}>${tr("O histórico está oculto. As rodadas continuam sendo registradas nesta partida.", "History is hidden. Rounds are still being recorded for this match.")}</p></section></div>`;
    for (const id of ["self", "audit"])
      main.querySelector(`[data-action="${id}"]`).disabled = !active;
    const log = main.querySelector(".log");
    log.scrollTop = log.scrollHeight;
  }
  function toggleHistory() {
    historyVisible = !historyVisible;
    const toggle = main.querySelector('[data-action="toggle-history"]');
    toggle.setAttribute("aria-expanded", String(historyVisible));
    toggle.textContent = historyVisible
      ? tr("Ocultar histórico", "Hide history")
      : tr("Mostrar histórico", "Show history");
    main.querySelector("#match-history").hidden = !historyVisible;
    main.querySelector(".history-hidden-note").hidden = historyVisible;
    if (historyVisible) {
      const log = main.querySelector(".log");
      log.scrollTop = log.scrollHeight;
    }
  }
  function newGame() {
    leaveReading();
    engine = new E.Engine();
    riskBag = [];
    lastCard = null;
    locked = false;
    quipIndex++;
    screen("game");
    activate();
  }
  function chooseLesson(card) {
    if (card === "S") return D.safe[Math.floor(Math.random() * D.safe.length)];
    if (!riskBag.length) riskBag = E.shuffled(D.risks);
    return riskBag.pop();
  }
  function resolve(self) {
    if (locked || pauseDialog.open || !engine || engine.over) return;
    locked = true;
    const r = engine.process(self);
    r.lesson = chooseLesson(r.card);
    lastCard = r;
    sound(r.damage ? "error" : "success");
    render();
    const effect = r.damage
      ? actor(r.target) +
        " " +
        tr("perdeu", "lost") +
        " " +
        r.damage +
        " " +
        tr("de integridade.", "integrity.")
      : tr("Nenhuma perda de integridade.", "No integrity lost.");
    show(
      lessonHtml(r.lesson) +
        "<hr><p>" +
        esc(
          actor(r.actor) +
            " · " +
            (r.self
              ? tr("Auto-implementar", "Self-implement")
              : tr("Auditar", "Audit")),
        ) +
        "</p><p>" +
        esc(effect) +
        "</p><p>" +
        tr(
          "Decisões de risco antes da compra",
          "Risky decisions before the draw",
        ) +
        " " +
        r.riskBefore +
        "</p>",
      () => {
        locked = false;
        render();
        if (engine.over) journal();
        else scheduleAI();
      },
      false,
      { card: r.card, preview: false },
    );
    if (r.damage) damageFeedback();
  }
  function tool(index) {
    if (locked || pauseDialog.open || engine.turn !== 0 || engine.over) return;
    const r = engine.use(index);
    if (!r) return;
    sound("item");
    const texts = D.tools[r.tool][english() ? 1 : 0];
    render();
    show(
      "<h2>" +
        esc(texts[0]) +
        "</h2><p>" +
        esc(texts[1]) +
        "</p>" +
        "<h3>" +
        tr("No dia a dia", "In everyday life") +
        "</h3><p>" +
        esc(texts[2]) +
        "</p>",
      null,
      false,
      r.revealed ? { card: r.revealed, preview: true } : null,
    );
  }
  function scheduleAI() {
    cancelAI();
    if (
      paused ||
      pauseDialog.open ||
      view !== "game" ||
      dialog.open ||
      !engine ||
      engine.over ||
      engine.turn !== 1
    )
      return;
    aiTimer = setTimeout(() => {
      aiTimer = null;
      if (paused || pauseDialog.open || view !== "game" || dialog.open) return;
      const index = engine.machineTool();
      if (index >= 0) {
        engine.use(index);
        sound("item");
        render();
        scheduleAI();
      } else {
        quipIndex++;
        resolve(engine.probability() <= 0.5);
      }
    }, 1200);
  }
  function eventText(e) {
    if (e.type === "batch")
      return (
        tr("Lote", "Batch") +
        " " +
        e.batch +
        " · " +
        e.safe +
        " " +
        tr("seguras", "safe") +
        " / " +
        e.risk +
        " " +
        tr("de risco", "risky")
      );
    if (e.type === "tool")
      return (
        actor(e.actor) +
        " · " +
        D.tools[e.tool][english() ? 1 : 0][0] +
        (e.healed ? " +" + e.healed : "") +
        (e.discarded
          ? " · " +
            tr("Descarte", "Discard") +
            " " +
            (e.discarded === "S"
              ? tr("segura", "safe")
              : tr("de risco", "risky"))
          : "")
      );
    return (
      actor(e.actor) +
      " · " +
      (e.self
        ? tr("Auto-implementar", "Self-implement")
        : tr("Auditar", "Audit")) +
      " · " +
      lesson(e.lesson).title +
      " · " +
      e.damage +
      " " +
      tr("de perda para", "loss to") +
      " " +
      actor(e.target)
    );
  }
  function gazetteHeader(edition) {
    return `<header class="gazette-masthead"><div class="gazette-dateline"><span>${tr("SOCIEDADE · TECNOLOGIA · DIREITOS", "SOCIETY · TECHNOLOGY · RIGHTS")}</span><span>${esc(edition)}</span></div><h1>${tr("Gazeta do Oráculo", "Oráculo Gazette")}</h1><p>${tr("As decisões de hoje. As consequências de amanhã.", "Today’s decisions. Tomorrow’s consequences.")}</p></header>`;
  }
  function journal() {
    const won = engine.winner === 0;
    const cards = engine.events.filter((event) => event.type === "card");
    const risks = cards.filter((event) => event.card === "R");
    const safe = cards.length - risks.length;
    const decisive = lesson(lastCard.lesson);
    const alerts = [...new Set(risks.map((event) => event.lesson))].filter(
      (id) => id !== lastCard.lesson,
    );
    const goodExamples = [
      ...new Set(
        cards
          .filter((event) => event.card === "S")
          .map((event) => event.lesson),
      ),
    ];
    const tools = engine.events.filter(
      (event) => event.type === "tool" && event.actor === 0,
    );
    const machineTools = engine.events.filter(
      (event) => event.type === "tool" && event.actor === 1,
    ).length;
    const counts = new Map();
    for (const event of tools)
      counts.set(event.tool, (counts.get(event.tool) || 0) + 1);
    const headline = won
      ? tr(
          "Auditoria interrompe atuação do Oráculo",
          "Audit brings the Oracle to a halt",
        )
      : tr(
          "Oráculo mantém influência após fim da auditoria",
          "Oracle retains influence after the audit ends",
        );
    const lead = tr(
      `Após ${cards.length} decisões reveladas em ${engine.batch} ${engine.batch === 1 ? "lote" : "lotes"}, a câmara encerrou a investigação com ${risks.length} decisões de risco e ${safe} seguras. ${won ? "O sistema do Oráculo chegou a zero de integridade, interrompendo sua atuação na simulação." : "A integridade do operador chegou a zero; o Oráculo permaneceu em operação na simulação."}`,
      `After ${cards.length} revealed decisions across ${engine.batch} ${engine.batch === 1 ? "batch" : "batches"}, the chamber closed its investigation with ${risks.length} risky decisions and ${safe} safe ones. ${won ? "The Oracle reached zero integrity, halting its activity in the simulation." : "The operator reached zero integrity; the Oracle remained active in the simulation."}`,
    );
    const alertArticle = (id) => {
      const item = lesson(id);
      return `<article class="gazette-brief"><h3>${esc(item.title)}</h3><p>${esc(item.scenario)}</p><p class="gazette-advice"><b>${tr("Fique atento:", "Watch out:")}</b> ${esc(item.precaution)}</p>${item.source ? `<p class="source">${esc(item.source)}</p>` : ""}</article>`;
    };
    show(
      `<article class="gazette-issue">
      ${gazetteHeader(tr("EDIÇÃO ESPECIAL", "SPECIAL EDITION"))}
      <p class="gazette-disclaimer">${tr("NOTÍCIA FICTÍCIA BASEADA NESTA PARTIDA · Casos documentados têm a fonte identificada.", "FICTIONAL NEWS BASED ON THIS MATCH · Documented cases include their source.")}</p>
      <section class="gazette-lead"><div class="gazette-kicker">${won ? tr("DESFECHO · AUDITORIA CONCLUÍDA", "OUTCOME · AUDIT COMPLETED") : tr("DESFECHO · ALERTA À SOCIEDADE", "OUTCOME · A WARNING TO SOCIETY")}</div><h2>${headline}</h2><p class="gazette-deck">${tr("O alerta decisivo:", "The decisive alert:")} ${esc(decisive.title)}</p><p class="gazette-byline">${tr("Da redação da Câmara de Auditoria", "From the Audit Chamber newsroom")} · ${tr("Lote", "Batch")} ${engine.batch}</p><p class="gazette-intro">${esc(lead)}</p></section>
      <div class="gazette-columns"><section class="gazette-main"><h3 class="gazette-section">${tr("O caso por trás da manchete", "The case behind the headline")}</h3><p class="gazette-case-tag">${decisive.source ? tr("EXEMPLO DOCUMENTADO", "DOCUMENTED EXAMPLE") : tr("SITUAÇÃO ILUSTRATIVA", "ILLUSTRATIVE SCENARIO")}</p><p class="gazette-case">${esc(decisive.scenario)}</p>${decisive.source ? `<p class="source">${esc(decisive.source)}</p>` : ""}
      <div class="gazette-network"><h3>${tr("Uma decisão nunca fica sozinha", "A decision never stands alone")}</h3><p>${esc(decisive.network || tr("Dados, pessoas e instituições participam dos efeitos de cada decisão.", "Data, people and institutions all shape a decision’s effects."))}</p><small>${tr("A Teoria Ator-Rede ajuda a enxergar essas conexões: a IA também altera o que acontece nessa rede.", "Actor-Network Theory helps make these connections visible: AI also changes what happens in this network.")}</small></div>
      ${decisive.question ? `<section class="gazette-discussion"><h3>${tr("A pergunta que fica", "The question that remains")}</h3><p>${esc(decisive.question)}</p></section>` : ""}
      </section><aside class="gazette-sidebar"><h3 class="gazette-section">${tr("A partida em números", "The match in numbers")}</h3><dl class="gazette-stats"><div><dt>${tr("Decisões reveladas", "Revealed decisions")}</dt><dd>${cards.length}</dd></div><div><dt>${tr("Seguras", "Safe")}</dt><dd>${safe}</dd></div><div><dt>${tr("De risco", "Risky")}</dt><dd>${risks.length}</dd></div><div><dt>${tr("Ferramentas usadas por você", "Tools used by you")}</dt><dd>${tools.length}</dd></div></dl><section class="gazette-precaution"><h3>${tr("Antes de confiar na IA", "Before trusting AI")}</h3><p>${esc(decisive.precaution)}</p></section><p class="gazette-integrity">${tr("Integridade final", "Final integrity")}<br>${tr("Você", "You")}: ${engine.actors[0].hp}/5 · Oráculo: ${engine.actors[1].hp}/5</p></aside></div>
      ${alerts.length ? `<section class="gazette-alerts"><h3 class="gazette-section">${tr("Outros alertas desta edição", "Other alerts in this edition")}</h3><div class="gazette-briefs">${alerts.slice(0, 2).map(alertArticle).join("")}</div>${alerts.length > 2 ? `<details><summary>${tr("Ler os demais casos encontrados", "Read the remaining cases encountered")} (${alerts.length - 2})</summary><div class="gazette-briefs">${alerts.slice(2).map(alertArticle).join("")}</div></details>` : ""}</section>` : ""}
      <section class="gazette-tools"><h3 class="gazette-section">${tr("As escolhas da auditoria", "The audit’s choices")}</h3>${
        tools.length
          ? `<div class="gazette-briefs">${[...counts]
              .map(([tool, count]) => {
                const text = D.tools[tool][english() ? 1 : 0];
                return `<article class="gazette-brief"><h3>${esc(text[0])} <small>×${count}</small></h3><p>${esc(text[2])}</p></article>`;
              })
              .join("")}</div>`
          : `<p>${tr("O operador não usou ferramentas nesta partida. Auditar, pedir revisão humana e proteger dados são cuidados que também merecem atenção fora do jogo.", "The operator used no tools in this match. Auditing, requesting human review and protecting data also deserve attention outside the game.")}</p>`
      }<p class="gazette-footnote">${tr("O Oráculo usou", "The Oracle used")} ${machineTools} ${tr((machineTools === 1 ? "ferramenta" : "ferramentas") + " durante a partida. Os itens representam ações da simulação; o uso de uma ferramenta não garante, por si só, uma decisão justa.", (machineTools === 1 ? "tool" : "tools") + " during the match. Items represent simulated actions; using a tool alone does not guarantee a fair decision.")}</p></section>
      ${goodExamples.length ? `<section class="gazette-good"><h3 class="gazette-section">${tr("Boas práticas também fizeram notícia", "Good practices made the news too")}</h3>${goodExamples.map((id) => `<p><b>${esc(lesson(id).title)}.</b> ${esc(lesson(id).precaution)}</p>`).join("")}</section>` : ""}
      <details class="gazette-record"><summary>${tr("Arquivo da redação · linha do tempo completa", "Newsroom archive · full session timeline")}</summary><ol class="gazette-timeline">${engine.events.map((event) => `<li>${esc(eventText(event))}</li>`).join("")}</ol></details>
      <footer class="gazette-footer"><span>${tr("Gazeta do Oráculo · Educação para decisões conscientes", "Oráculo Gazette · Learning to make informed decisions")}</span><a href="guia.pdf" target="_blank" rel="noopener">${tr("Consultar fontes", "Consult sources")}</a></footer>
    </article>`,
      null,
      true,
    );
  }
  main.addEventListener("input", (event) => {
    if (event.target.id === "volume") {
      volume = Number(event.target.value) / 100;
      document.querySelector("#volume-label").textContent =
        Math.round(volume * 100) + "%";
      for (const [name, audio] of Object.entries(sounds))
        audio.volume = volume * 0.8 * (name === "ambient_drone" ? 0.28 : 1);
      if (volume) activate(true);
    }
  });
  main.addEventListener("click", (event) => {
    if (view === "intro") {
      activate(true);
      introStep();
      return;
    }
    const b = event.target.closest("button");
    if (!b || b.disabled) return;
    sound("click");
    activate(true);
    if (b.dataset.card) {
      show(lessonHtml(b.dataset.card));
      return;
    }
    if (b.dataset.tool !== undefined) {
      tool(Number(b.dataset.tool));
      return;
    }
    const id = b.dataset.action;
    if (id === "play") {
      if (!engine || engine.over) newGame();
      else screen("game");
    } else if (id === "story") {
      introIndex = 0;
      introTime = 0;
      introStarted = true;
      screen("intro");
    } else if (id === "toggle-history") toggleHistory();
    else if (id === "pause") openPause();
    else if (id === "new") openPause("restart");
    else if (id === "self" || id === "audit") {
      if (engine && engine.turn === 0) resolve(id === "self");
    } else if (id === "journal") journal();
    else if (id === "pt" || id === "en") {
      lang = id;
      render();
    } else if (id === "previous" || id === "next") {
      tutorialPage += id === "next" ? 1 : -1;
      render();
      window.scrollTo(0, 0);
    } else if (id === "tutorial") {
      tutorialPage = 0;
      screen(id);
    } else if (id === "fullscreen") toggleFullscreen();
    else if (id) screen(id);
  });
  const sheet = new Image();
  sheet.src = "assets/oracle-spritesheet.png";
  let lastFrame = -1;
  function animate(time) {
    if (view === "intro" && introStarted && !paused) {
      const elapsed = introTime ? Math.min(time - introTime, 100) : 0;
      if (introIndex < D.intro[lang].length) {
        const before = Math.floor(introIndex);
        introIndex = matchMedia("(prefers-reduced-motion: reduce)").matches
          ? D.intro[lang].length
          : Math.min(D.intro[lang].length, introIndex + elapsed / 22);
        updateIntro();
        const chunk = D.intro[lang].slice(before, Math.floor(introIndex));
        if (/\S/.test(chunk) && time - lastTypingSound >= 45) {
          sound("typing");
          lastTypingSound = time;
        }
      }
    }
    introTime = time;
    const node = main.querySelector(".oracle");
    if (node && !paused && !pauseDialog.open) {
      const state =
          engine && engine.over
            ? "defeated"
            : time < damageUntil
              ? "damaged"
              : engine && engine.turn === 1
                ? "thinking"
                : "idle",
        a = D.animation.animations[state],
        frame = a.start + (Math.floor((time / 1000) * a.fps) % a.frames);
      if (frame !== lastFrame) {
        node.style.backgroundPosition =
          -(frame % D.animation.columns) * D.animation.frame_width +
          "px " +
          -Math.floor(frame / D.animation.columns) * D.animation.frame_height +
          "px";
        lastFrame = frame;
      }
    }
    requestAnimationFrame(animate);
  }
  window.App = {
    back() {
      if (pauseDialog.open) {
        if (pausePanel === "home") resumeMatch();
        else renderPause();
        return "stay";
      }
      if (dialog.open) {
        if (view === "game") openPause();
        else closeReading();
        return "stay";
      }
      if (view === "game") {
        openPause();
        return "stay";
      }
      if (view !== "menu") {
        screen("menu");
        return "stay";
      }
      return "exit";
    },
    pause() {
      paused = true;
      cancelAI();
      for (const audio of Object.values(sounds)) audio.pause();
    },
    resume() {
      paused = false;
      activate();
      scheduleAI();
    },
  };
  document.addEventListener("visibilitychange", () =>
    document.hidden ? window.App.pause() : window.App.resume(),
  );
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      !event.repeat &&
      view === "game" &&
      !pauseDialog.open &&
      !dialog.open
    ) {
      event.preventDefault();
      openPause();
      return;
    }
    if (
      view === "intro" &&
      [" ", "Enter"].includes(event.key) &&
      !event.repeat
    ) {
      event.preventDefault();
      activate(true);
      introStep();
    }
  });
  function fitStage() {
    document.documentElement.style.setProperty(
      "--stage-scale",
      Math.min(innerWidth / 1280, innerHeight / 740),
    );
  }
  addEventListener("resize", fitStage);
  fitStage();
  for (const eventName of ["pointerover", "focusin"])
    main.addEventListener(eventName, (event) => {
      const toolButton = event.target.closest("[data-tool]");
      const description = main.querySelector(".tool-description");
      if (toolButton && description) description.textContent = toolButton.title;
    });
  render();
  requestAnimationFrame(animate);
})();
