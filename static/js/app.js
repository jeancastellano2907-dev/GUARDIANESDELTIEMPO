(() => {
  const STORAGE_KEY = "guardianes_state_v1";
  const DEFAULT_STATE = {
    student_name: "Viajero",
    explored_concepts: [],
    diagnostic: {},
    challenges: {},
    badges: [],
  };

  function loadStaticState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_STATE };
      return { ...DEFAULT_STATE, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  function saveStaticState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors
    }
  }

  const curriculum = window.__INITIAL_CURRICULUM__;
  let appState = window.__STATIC_MODE__
    ? loadStaticState()
    : window.__INITIAL_STATE__ || { ...DEFAULT_STATE };

  const root = document.getElementById("app-root");
  const modal = document.getElementById("feedback-modal");
  const modalIcon = document.getElementById("feedback-icon");
  const modalTitle = document.getElementById("feedback-title");
  const modalBody = document.getElementById("feedback-body");
  const modalBtn = document.getElementById("feedback-close-btn");

  let currentView = "home";
  let viewParam = null;
  let onModalClose = null;

  // Ephemeral challenge interaction states
  let c1Step = 0; // 0 = intro, 1..4 = questions, 5 = completed
  let clozeAnswers = {};
  let activeBlank = "b1";
  let matchSelectedDesc = null;
  let matchedPairs = {};

  let c2Step = 0; // 0 = intro, 1 = map, 2 = completed
  let activeNodeId = null;

  let c3Step = 0; // 0 = intro, 1 = timeline, 2 = completed
  let timelinePlacements = {}; // slot_id -> card_id
  let selectedTimelineCard = null;

  let diagIndex = 0;

  // ---------- API / LocalStorage Helpers ----------
  function handleStaticApi(url, payload) {
    const next = {
      ...appState,
      explored_concepts: [...appState.explored_concepts],
      diagnostic: { ...appState.diagnostic },
      challenges: { ...appState.challenges },
      badges: [...appState.badges],
    };

    if (url === "/api/profile") {
      const clean = String(payload.student_name || "Viajero").trim().slice(0, 40) || "Viajero";
      next.student_name = clean;
    } else if (url === "/api/explore" && payload.concept_id) {
      if (!next.explored_concepts.includes(payload.concept_id)) {
        next.explored_concepts.push(payload.concept_id);
      }
    } else if (url === "/api/diagnostic" && payload.question_id) {
      const prev = next.diagnostic[payload.question_id] || { is_correct: false, attempts: 0 };
      next.diagnostic[payload.question_id] = {
        is_correct: Boolean(prev.is_correct || payload.is_correct),
        attempts: prev.attempts + 1,
      };
    } else if (url === "/api/attempt" && payload.item_id) {
      const prev = next.challenges[payload.item_id] || { is_correct: false, attempts: 0 };
      next.challenges[payload.item_id] = {
        challenge_id: payload.challenge_id || "",
        is_correct: Boolean(prev.is_correct || payload.is_correct),
        attempts: prev.attempts + 1,
      };
      if (payload.unlock_badge && !next.badges.includes(payload.unlock_badge)) {
        next.badges.push(payload.unlock_badge);
      }
    } else if (url === "/api/reset") {
      next.explored_concepts = [];
      next.diagnostic = {};
      next.challenges = {};
      next.badges = [];
    }

    appState = next;
    saveStaticState(appState);
    return { state: appState };
  }

  async function postApi(url, payload = {}) {
    if (window.__STATIC_MODE__) {
      return handleStaticApi(url, payload);
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.state) {
      appState = data.state;
    }
    return data;
  }

  function showFeedback(isSuccess, title, message, callback = null) {
    modalIcon.textContent = isSuccess ? "🌟" : "💡";
    modalTitle.textContent = title;
    modalBody.textContent = message;
    modalBtn.className = `btn modal-btn ${isSuccess ? "btn-primary-green" : "btn-gold"}`;
    modalBtn.textContent = isSuccess ? "Continuar" : "Intentar de nuevo";
    onModalClose = callback;
    modal.classList.remove("hidden");
  }

  modalBtn.addEventListener("click", () => {
    modal.classList.add("hidden");
    const cb = onModalClose;
    onModalClose = null;
    if (cb) cb();
  });

  function navigate(view, param = null) {
    currentView = view;
    viewParam = param;
    render();
    root.scrollTop = 0;
  }

  // ---------- Illustrations (Offline-ready, 5th-grade storybook style) ----------
  function svgConstellation() {
    return `
      <svg viewBox="0 0 280 72" width="100%" height="72" aria-hidden="true">
        <path d="M22,48 Q75,18 135,44 T258,34" fill="none" stroke="#d9a436" stroke-width="2.5" stroke-dasharray="5 4"/>
        <circle cx="22" cy="48" r="10" fill="#e8f5e9" stroke="#6d4c41" stroke-width="2"/>
        <text x="22" y="52" text-anchor="middle" font-size="10">🪨</text>
        <circle cx="80" cy="30" r="11" fill="#fff8e1" stroke="#d49412" stroke-width="2"/>
        <text x="80" y="34" text-anchor="middle" font-size="11">🏛️</text>
        <circle cx="140" cy="45" r="11" fill="#ede7f6" stroke="#5e35b1" stroke-width="2"/>
        <text x="140" y="49" text-anchor="middle" font-size="11">🏰</text>
        <circle cx="200" cy="27" r="11" fill="#e3f2fd" stroke="#1e88e5" stroke-width="2"/>
        <text x="200" y="31" text-anchor="middle" font-size="11">⛵</text>
        <circle cx="258" cy="34" r="11" fill="#fce4ec" stroke="#e53935" stroke-width="2"/>
        <text x="258" y="38" text-anchor="middle" font-size="11">🚀</text>
      </svg>`;
  }

  function svgLandmarks() {
    return `<img src="static/assets/home_landmarks.jpg" alt="Monumentos históricos: Esfinge, Pirámides, Castillo Medieval y Taj Mahal" class="landmarks-img" />`;
  }

  function svgFlags() {
    return `
      <svg viewBox="0 0 200 105" width="100%" height="95" aria-hidden="true">
        <line x1="55" y1="18" x2="88" y2="96" stroke="#c89216" stroke-width="5" stroke-linecap="round"/>
        <polygon points="56,20 12,32 24,52 18,72 68,54" fill="#ff5722"/>
        <line x1="145" y1="18" x2="112" y2="96" stroke="#c89216" stroke-width="5" stroke-linecap="round"/>
        <polygon points="144,20 188,32 176,52 182,72 132,54" fill="#ff5722"/>
      </svg>`;
  }

  function svgMedal(num) {
    return `
      <svg viewBox="0 0 130 140" width="116" height="124" aria-hidden="true">
        <polygon points="42,84 26,134 48,122 62,134 62,84" fill="#4b83f2"/>
        <polygon points="88,84 104,134 82,122 68,134 68,84" fill="#3b6fd9"/>
        <circle cx="65" cy="54" r="44" fill="#fcd74b" stroke="#fff4b8" stroke-width="4"/>
        <circle cx="65" cy="54" r="34" fill="#f5be2e"/>
        <text x="65" y="68" text-anchor="middle" font-size="40" font-weight="900" fill="#fffdf2">${num}</text>
      </svg>`;
  }

  function svgPeriod(periodId) {
    if (periodId === "prehistoria") {
      return `<img src="static/assets/period_prehistoria.jpg" alt="Prehistoria" style="width:100%;height:110px;object-fit:cover;display:block;" />`;
    }
    if (periodId === "antigua") {
      return `<img src="static/assets/period_antigua.jpg" alt="Edad Antigua" style="width:100%;height:110px;object-fit:cover;display:block;" />`;
    }
    const svgs = {
      media: `
        <svg viewBox="0 0 180 110" width="100%" height="110" style="display:block;background:linear-gradient(180deg,#bae6fd,#e0f2fe);">
          <ellipse cx="90" cy="108" rx="100" ry="26" fill="#86efac"/>
          <rect x="48" y="46" width="84" height="52" fill="#cbd5e1" stroke="#475569" stroke-width="2"/>
          <rect x="38" y="34" width="22" height="64" fill="#94a3b8" stroke="#475569" stroke-width="2"/>
          <polygon points="35,34 49,14 63,34" fill="#ef4444" stroke="#475569" stroke-width="2"/>
          <rect x="120" y="34" width="22" height="64" fill="#94a3b8" stroke="#475569" stroke-width="2"/>
          <polygon points="117,34 131,14 145,34" fill="#ef4444" stroke="#475569" stroke-width="2"/>
          <rect x="78" y="24" width="24" height="74" fill="#cbd5e1" stroke="#475569" stroke-width="2"/>
          <polygon points="75,24 90,6 105,24" fill="#3b82f6" stroke="#475569" stroke-width="2"/>
          <path d="M78,98 L78,72 Q90,60 102,72 L102,98 Z" fill="#78350f"/>
          <line x1="90" y1="6" x2="90" y2="1" stroke="#475569" stroke-width="2"/>
        </svg>`,
      moderna: `
        <svg viewBox="0 0 180 110" width="100%" height="110" style="display:block;background:linear-gradient(180deg,#fde68a,#bae6fd);">
          <circle cx="145" cy="26" r="14" fill="#fbbf24"/>
          <path d="M0,84 Q30,74 60,84 T120,84 T180,84 L180,110 L0,110 Z" fill="#38bdf8"/>
          <path d="M0,94 Q30,86 60,94 T120,94 T180,94 L180,110 L0,110 Z" fill="#0284c7"/>
          <path d="M48,78 L128,78 L116,92 L58,92 Z" fill="#92400e" stroke="#451a03" stroke-width="2"/>
          <line x1="76" y1="26" x2="76" y2="78" stroke="#451a03" stroke-width="3"/>
          <line x1="104" y1="34" x2="104" y2="78" stroke="#451a03" stroke-width="3"/>
          <path d="M78,28 Q98,42 78,64 Z" fill="#fffbeb" stroke="#d97706" stroke-width="1.5"/>
          <path d="M106,36 Q124,48 106,68 Z" fill="#fffbeb" stroke="#d97706" stroke-width="1.5"/>
          <polygon points="76,22 90,26 76,30" fill="#ef4444"/>
        </svg>`,
      contemporanea: `
        <svg viewBox="0 0 180 110" width="100%" height="110" style="display:block;background:linear-gradient(180deg,#1e1b4b,#312e81);">
          <circle cx="28" cy="22" r="2" fill="#fef08a"/><circle cx="62" cy="14" r="1.5" fill="#fff"/>
          <circle cx="145" cy="20" r="2" fill="#fef08a"/><circle cx="162" cy="40" r="1.5" fill="#fff"/>
          <rect x="16" y="56" width="22" height="54" fill="#475569"/>
          <rect x="44" y="42" width="26" height="68" fill="#64748b"/>
          <rect x="118" y="48" width="24" height="62" fill="#475569"/>
          <rect x="146" y="62" width="22" height="48" fill="#64748b"/>
          <rect x="50" y="50" width="5" height="6" fill="#fde047"/><rect x="60" y="50" width="5" height="6" fill="#fde047"/>
          <rect x="50" y="64" width="5" height="6" fill="#fde047"/><rect x="124" y="58" width="5" height="6" fill="#fde047"/>
          <!-- Rocket -->
          <path d="M90,14 Q102,32 100,62 L80,62 Q78,32 90,14 Z" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>
          <path d="M90,14 Q96,24 98,30 L82,30 Q84,24 90,14 Z" fill="#ef4444"/>
          <circle cx="90" cy="42" r="5" fill="#38bdf8" stroke="#1e293b" stroke-width="1.5"/>
          <polygon points="80,52 72,64 80,62" fill="#ef4444"/>
          <polygon points="100,52 108,64 100,62" fill="#ef4444"/>
          <polygon points="84,62 90,78 96,62" fill="#fb923c"/>
        </svg>`,
    };
    return svgs[periodId] || svgs.media;
  }

  // ---------- Screen Renderers ----------
  function renderHome() {
    root.innerHTML = `
      <section class="screen home-screen">
        <div>
          <div class="home-logo">
            <span class="home-badge-pill">🧭 Viaje por la historia • Grado 5°</span>
            <div class="brand-top">GUARDIANES</div>
            <div class="brand-bottom">DEL TIEMPO</div>
            <div class="home-subtitle">${curriculum.meta.institution}</div>
          </div>
          <div class="constellation-wrap">${svgConstellation()}</div>
          <div class="name-pill">
            <input type="text" id="student-name-input" placeholder="Tu nombre de viajero..." value="${escapeHtml(appState.student_name)}" />
            <button class="btn btn-gold btn-sm" id="save-name-btn">Guardar</button>
          </div>
        </div>
        <div>
          <div class="home-actions">
            <button class="btn btn-red" id="btn-play">Jugar</button>
            <button class="btn btn-outline" id="btn-instructions">Instrucciones</button>
          </div>
          <div class="landmarks-footer">${svgLandmarks()}</div>
        </div>
      </section>
    `;

    document.getElementById("save-name-btn").addEventListener("click", async () => {
      const val = document.getElementById("student-name-input").value;
      await postApi("/api/profile", { student_name: val });
      showFeedback(true, "¡Nombre guardado!", `¡Bienvenido, ${appState.student_name}! Listo para viajar por la historia.`);
    });

    document.getElementById("btn-play").addEventListener("click", () => navigate("hub"));
    document.getElementById("btn-instructions").addEventListener("click", () => navigate("instructions"));
  }

  function renderInstructions() {
    root.innerHTML = `
      <section class="screen">
        <div class="top-bar">
          <button class="back-btn" id="back-home" aria-label="Volver">◀</button>
          <div class="top-title">¿Cómo jugar?</div>
          <div class="spacer-34"></div>
        </div>
        <div class="instructions-body">
          <div class="instructions-text">
            <p><strong>Hola, ${escapeHtml(appState.student_name)}.</strong></p>
            <p>En esta aventura recorrerás dos etapas para convertirte en Guardián del Tiempo:</p>
            <p>1. <strong>Exploración:</strong> descubre los conceptos clave y realiza tu prueba diagnóstica.</p>
            <p>2. <strong>Práctica:</strong> supera los 3 retos y gana las insignias de <em>Detective</em>, <em>Arquitecto</em> y <em>Viajero</em>.</p>
            <p><strong>¿Estás listo para afrontar este reto?</strong></p>
          </div>
          <div>
            <div style="text-align:center;margin-bottom:14px;">
              <button class="btn btn-primary-green" id="btn-ready">¡Estoy listo!</button>
            </div>
            <div class="landmarks-footer">${svgLandmarks()}</div>
          </div>
        </div>
      </section>
    `;
    document.getElementById("back-home").addEventListener("click", () => navigate("home"));
    document.getElementById("btn-ready").addEventListener("click", () => navigate("hub"));
  }

  function renderHub() {
    const exploredCount = appState.explored_concepts.length;
    const totalConcepts = curriculum.exploration_concepts.length;
    const diagDone = Object.keys(appState.diagnostic).length;
    const diagTotal = curriculum.diagnostic_questions.length;
    const badges = new Set(appState.badges);

    root.innerHTML = `
      <section class="screen">
        <div class="hub-header">
          <div class="hub-greeting">
            <div>
              <h2>Hola, ${escapeHtml(appState.student_name)} 👋</h2>
              <div class="hub-school">${curriculum.meta.area} • ${curriculum.meta.grade}</div>
            </div>
            <button class="btn btn-outline btn-sm" id="btn-progress">Mi Progreso</button>
          </div>
          <div class="badge-shelf">
            <div class="badge-chip ${badges.has("Detective") ? "earned" : ""}">🏅 Detective</div>
            <div class="badge-chip ${badges.has("Arquitecto") ? "earned" : ""}">🏅 Arquitecto</div>
            <div class="badge-chip ${badges.has("Viajero") ? "earned" : ""}">🏅 Viajero</div>
          </div>
        </div>

        <div class="hub-phases">
          <div class="phase-card">
            <div class="phase-card-head">
              <span class="phase-tag">Fase 1 • Exploración</span>
              <span class="phase-status">${exploredCount}/${totalConcepts} conceptos • ${diagDone}/${diagTotal} diag.</span>
            </div>
            <h3>Ruta de Conceptos y Diagnóstico</h3>
            <p>Explora el tiempo histórico, fuentes, cambios y permanencias, y mide tus conocimientos iniciales.</p>
            <div class="phase-actions">
              <button class="btn btn-gold btn-sm" id="go-explore">Ruta de conceptos</button>
              <button class="btn btn-outline btn-sm" id="go-diagnostic">Prueba diagnóstica</button>
            </div>
          </div>

          <div class="phase-card">
            <div class="phase-card-head">
              <span class="phase-tag">Práctica • Retos</span>
              <span class="phase-status">${badges.size}/3 insignias</span>
            </div>
            <h3>Los 3 Retos del Tiempo</h3>
            <p>Aplica lo aprendido en los desafíos interactivos y gana tus tres insignias.</p>
            <div class="phase-actions">
              <button class="btn btn-red btn-sm" id="go-c1">1. Detectives</button>
              <button class="btn btn-red btn-sm" id="go-c2">2. Arquitectos</button>
              <button class="btn btn-red btn-sm" id="go-c3">3. Viajeros</button>
            </div>
          </div>

          <div style="text-align:center;margin-top:4px;">
            <button class="btn btn-outline btn-sm" id="go-home">Inicio</button>
          </div>
        </div>
      </section>
    `;

    document.getElementById("btn-progress").addEventListener("click", () => navigate("progress"));
    document.getElementById("go-explore").addEventListener("click", () => navigate("explore_route"));
    document.getElementById("go-diagnostic").addEventListener("click", () => {
      diagIndex = 0;
      navigate("diagnostic");
    });
    document.getElementById("go-c1").addEventListener("click", () => {
      c1Step = 0;
      navigate("challenge_1");
    });
    document.getElementById("go-c2").addEventListener("click", () => {
      c2Step = 0;
      navigate("challenge_2");
    });
    document.getElementById("go-c3").addEventListener("click", () => {
      c3Step = 0;
      navigate("challenge_3");
    });
    document.getElementById("go-home").addEventListener("click", () => navigate("home"));
  }

  // ---------- Phase 1: Exploración ----------
  function renderExploreRoute() {
    const explored = new Set(appState.explored_concepts);
    const itemsHtml = curriculum.exploration_concepts
      .map((c, idx) => {
        const done = explored.has(c.id);
        return `
          <button class="concept-node-btn ${done ? "done" : ""}" data-cid="${c.id}">
            <div class="concept-icon">${c.icon}</div>
            <div style="flex:1;">
              <div style="font-size:14px;font-weight:800;">${idx + 1}. ${c.title}</div>
              <div style="font-size:11.5px;color:var(--muted);">${done ? "Completado ✓" : "Toca para explorar"}</div>
            </div>
            <span>▶</span>
          </button>`;
      })
      .join("");

    root.innerHTML = `
      <section class="screen">
        <div class="top-bar">
          <button class="back-btn" id="back-hub">◀</button>
          <div class="top-title">Ruta de Exploración</div>
          <div class="spacer-34"></div>
        </div>
        <div class="screen-padded">
          <p class="question-prompt">Sigue la ruta interactiva y descubre los 5 conceptos clave antes de tu prueba diagnóstica.</p>
          <div class="concept-route">${itemsHtml}</div>
        </div>
      </section>
    `;

    document.getElementById("back-hub").addEventListener("click", () => navigate("hub"));
    root.querySelectorAll(".concept-node-btn").forEach((btn) => {
      btn.addEventListener("click", () => navigate("explore_detail", btn.dataset.cid));
    });
  }

  function renderExploreDetail(conceptId) {
    const concept = curriculum.exploration_concepts.find((c) => c.id === conceptId);
    if (!concept) return navigate("explore_route");

    const optsHtml = concept.check.options
      .map((opt, idx) => `<button class="option-btn" data-idx="${idx}">${opt}</button>`)
      .join("");

    root.innerHTML = `
      <section class="screen">
        <div class="top-bar">
          <button class="back-btn" id="back-route">◀</button>
          <div class="top-title">${concept.icon} ${concept.title}</div>
          <div class="spacer-34"></div>
        </div>
        <div class="screen-padded">
          <div class="concept-detail-card">
            <p>${concept.summary}</p>
            <div class="example-box">${concept.example}</div>
          </div>
          <div style="font-size:14px;font-weight:800;margin-bottom:6px;">Comprueba lo aprendido:</div>
          <p style="font-size:13.5px;margin-bottom:8px;">${concept.check.question}</p>
          <div class="option-list">${optsHtml}</div>
        </div>
      </section>
    `;

    document.getElementById("back-route").addEventListener("click", () => navigate("explore_route"));
    root.querySelectorAll(".option-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const idx = Number(btn.dataset.idx);
        const ok = idx === concept.check.correct_index;
        if (ok) {
          await postApi("/api/explore", { concept_id: concept.id });
          showFeedback(true, "¡Concepto dominado!", concept.check.feedback_ok, () => navigate("explore_route"));
        } else {
          showFeedback(false, "¡Casi lo logras!", concept.check.feedback_hint);
        }
      });
    });
  }

  function renderDiagnostic() {
    const questions = curriculum.diagnostic_questions;
    if (diagIndex >= questions.length) {
      const correctCount = Object.values(appState.diagnostic).filter((d) => d.is_correct).length;
      root.innerHTML = `
        <section class="screen screen-gold">
          <div class="top-bar">
            <button class="back-btn" id="back-hub">◀</button>
            <div class="top-title top-title-white">Diagnóstico</div>
            <div class="spacer-34"></div>
          </div>
          <div class="completado-card" style="margin-top:40px;">
            <div class="medal-wrap">${svgMedal("★")}</div>
            <h2>¡Diagnóstico Completado!</h2>
            <p style="margin:12px 0;font-size:14px;color:var(--muted);">
              Respondiste <strong>${correctCount} de ${questions.length}</strong> preguntas iniciales.
              Ahora pasa a la fase de <strong>Práctica</strong> para superar los 3 retos.
            </p>
            <button class="btn btn-primary-green btn-block" id="go-practice">Ir al Reto 1: Detectives</button>
            <button class="btn btn-outline btn-block" id="go-hub-btn" style="margin-top:10px;">Volver al Mapa</button>
          </div>
        </section>
      `;
      document.getElementById("back-hub").addEventListener("click", () => navigate("hub"));
      document.getElementById("go-practice").addEventListener("click", () => {
        c1Step = 0;
        navigate("challenge_1");
      });
      document.getElementById("go-hub-btn").addEventListener("click", () => navigate("hub"));
      return;
    }

    const q = questions[diagIndex];
    const optsHtml = q.options
      .map((opt, idx) => `<button class="option-btn" data-idx="${idx}">${opt}</button>`)
      .join("");

    root.innerHTML = `
      <section class="screen">
        <div class="top-bar">
          <button class="back-btn" id="back-hub">◀</button>
          <div class="top-title">Prueba Diagnóstica (${diagIndex + 1}/${questions.length})</div>
          <div class="spacer-34"></div>
        </div>
        <div class="screen-padded">
          <p class="question-prompt">${q.question}</p>
          <div class="option-list">${optsHtml}</div>
        </div>
      </section>
    `;

    document.getElementById("back-hub").addEventListener("click", () => navigate("hub"));
    root.querySelectorAll(".option-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ok = Number(btn.dataset.idx) === q.correct_index;
        await postApi("/api/diagnostic", { question_id: q.id, is_correct: ok });
        if (ok) {
          showFeedback(true, "¡Muy bien!", q.feedback_ok, () => {
            diagIndex += 1;
            renderDiagnostic();
          });
        } else {
          showFeedback(false, "Retroalimentación", q.feedback_hint, () => {
            diagIndex += 1;
            renderDiagnostic();
          });
        }
      });
    });
  }

  // ---------- Phase 3: Reto 1 (Detectives de la historia) ----------
  function renderChallenge1() {
    const c1 = curriculum.challenge_1;
    if (c1Step === 0) {
      root.innerHTML = `
        <section class="screen screen-gold">
          <div class="top-bar">
            <button class="back-btn" id="back-hub">◀</button>
            <div class="top-title top-title-white">QUIZ #1</div>
            <div class="spacer-34"></div>
          </div>
          <div class="quiz-intro-body">
            <div>
              <div class="flags-wrap">${svgFlags()}</div>
              <h2 class="quiz-intro-title">${c1.title}</h2>
              <p class="quiz-intro-desc">${c1.description}</p>
            </div>
            <button class="play-circle-btn" id="start-c1" aria-label="Iniciar reto 1">
              <span style="font-size:28px;color:#fff;margin-left:4px;">▶</span>
            </button>
          </div>
        </section>
      `;
      document.getElementById("back-hub").addEventListener("click", () => navigate("hub"));
      document.getElementById("start-c1").addEventListener("click", () => {
        c1Step = 1;
        renderChallenge1();
      });
      return;
    }

    if (c1Step === 5) {
      root.innerHTML = `
        <section class="screen screen-gold">
          <div class="top-bar">
            <button class="back-btn" id="back-hub">◀</button>
            <div class="top-title top-title-white">Completado</div>
            <div class="spacer-34"></div>
          </div>
          <div class="completado-card" style="margin-top:64px;">
            <div class="medal-wrap">${svgMedal(1)}</div>
            <p style="font-size:15px;color:var(--muted);">¡Lo lograste! Has ganado la insignia de</p>
            <div class="badge-name-red">${c1.badge}</div>
            <div style="width:100%;margin-top:28px;display:flex;flex-direction:column;gap:10px;">
              <button class="btn btn-primary-green btn-block" id="next-c2">Siguiente reto: Arquitectos</button>
              <button class="btn btn-outline btn-block" id="go-hub">Volver al Mapa</button>
            </div>
          </div>
        </section>
      `;
      document.getElementById("back-hub").addEventListener("click", () => navigate("hub"));
      document.getElementById("go-hub").addEventListener("click", () => navigate("hub"));
      document.getElementById("next-c2").addEventListener("click", () => {
        c2Step = 0;
        navigate("challenge_2");
      });
      return;
    }

    const q = c1.questions[c1Step - 1];
    if (q.type === "image_choice") {
      const cards = q.options
        .map(
          (o) => `
          <div class="img-choice-card" data-oid="${o.id}">
            ${svgPeriod(o.illustration)}
            <div class="img-choice-label">${o.label}</div>
          </div>`
        )
        .join("");

      root.innerHTML = `
        <section class="screen">
          <div class="top-bar">
            <button class="back-btn" id="back-c1">◀</button>
            <div class="top-title">Pregunta #1</div>
            <div class="spacer-34"></div>
          </div>
          <div class="screen-padded">
            <p class="question-prompt">${q.prompt}</p>
            <div class="image-grid-2x2">${cards}</div>
          </div>
        </section>
      `;

      document.getElementById("back-c1").addEventListener("click", () => {
        c1Step = 0;
        renderChallenge1();
      });
      root.querySelectorAll(".img-choice-card").forEach((card) => {
        card.addEventListener("click", async () => {
          const ok = card.dataset.oid === q.correct_id;
          await postApi("/api/attempt", { challenge_id: c1.id, item_id: q.id, is_correct: ok });
          if (ok) {
            showFeedback(true, "¡Correcto!", q.feedback_ok, () => {
              c1Step = 2;
              renderChallenge1();
            });
          } else {
            showFeedback(false, "Sigue buscando pistas", q.feedback_hint);
          }
        });
      });
      return;
    }

    if (q.type === "true_false") {
      root.innerHTML = `
        <section class="screen">
          <div class="top-bar">
            <button class="back-btn" id="back-c1">◀</button>
            <div class="top-title">Pregunta #2</div>
            <div class="spacer-34"></div>
          </div>
          <div class="screen-padded tf-stage">
            <div>
              <p class="question-prompt">${q.prompt}</p>
              <div style="border-radius:14px;overflow:hidden;border:2px solid var(--border-light);">
                ${svgPeriod(q.illustration)}
              </div>
              <p class="tf-statement">${q.statement}</p>
            </div>
            <div class="tf-buttons">
              <button class="tf-btn-true" id="tf-true" aria-label="Verdadero">✓</button>
              <button class="tf-btn-false" id="tf-false" aria-label="Falso">✕</button>
            </div>
          </div>
        </section>
      `;

      document.getElementById("back-c1").addEventListener("click", () => {
        c1Step = 1;
        renderChallenge1();
      });
      const handleTf = async (val) => {
        const ok = val === q.correct_bool;
        await postApi("/api/attempt", { challenge_id: c1.id, item_id: q.id, is_correct: ok });
        if (ok) {
          showFeedback(true, "¡Verdadero!", q.feedback_ok, () => {
            c1Step = 3;
            clozeAnswers = {};
            activeBlank = "b1";
            renderChallenge1();
          });
        } else {
          showFeedback(false, "Revisa la pista", q.feedback_hint);
        }
      };
      document.getElementById("tf-true").addEventListener("click", () => handleTf(true));
      document.getElementById("tf-false").addEventListener("click", () => handleTf(false));
      return;
    }

    if (q.type === "cloze") {
      const blanks = q.segments.filter((s) => typeof s === "object");
      const dotsHtml = blanks
        .map((b) => `<span class="dot ${clozeAnswers[b.blank_id] ? "filled" : ""}"></span>`)
        .join("");

      const textHtml = q.segments
        .map((seg) => {
          if (typeof seg === "string") return seg;
          const val = clozeAnswers[seg.blank_id] || "________";
          const isAct = activeBlank === seg.blank_id ? "active" : "";
          return `<span class="cloze-blank ${isAct}" data-bid="${seg.blank_id}">${val}</span>`;
        })
        .join("");

      const usedWords = new Set(Object.values(clozeAnswers));
      const bankHtml = q.word_bank
        .map(
          (w) =>
            `<button class="word-chip ${usedWords.has(w) ? "used" : ""}" data-word="${w}">${w}</button>`
        )
        .join("");

      root.innerHTML = `
        <section class="screen">
          <div class="top-bar">
            <button class="back-btn" id="back-c1">◀</button>
            <div class="top-title">Pregunta #3</div>
            <div class="spacer-34"></div>
          </div>
          <div class="screen-padded">
            <div class="progress-dots">${dotsHtml}</div>
            <p class="question-prompt">${q.prompt}</p>
            <div class="cloze-box">${textHtml}</div>
            <div class="word-bank">${bankHtml}</div>
            <button class="btn btn-primary-green btn-block" id="check-cloze">Comprobar respuestas</button>
          </div>
        </section>
      `;

      document.getElementById("back-c1").addEventListener("click", () => {
        c1Step = 2;
        renderChallenge1();
      });
      root.querySelectorAll(".cloze-blank").forEach((el) => {
        el.addEventListener("click", () => {
          activeBlank = el.dataset.bid;
          renderChallenge1();
        });
      });
      root.querySelectorAll(".word-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          clozeAnswers[activeBlank] = chip.dataset.word;
          const next = blanks.find((b) => !clozeAnswers[b.blank_id]);
          if (next) activeBlank = next.blank_id;
          renderChallenge1();
        });
      });
      document.getElementById("check-cloze").addEventListener("click", async () => {
        const allCorrect = blanks.every((b) => clozeAnswers[b.blank_id] === b.answer);
        await postApi("/api/attempt", { challenge_id: c1.id, item_id: q.id, is_correct: allCorrect });
        if (allCorrect) {
          showFeedback(true, "¡Excelente!", q.feedback_ok, () => {
            c1Step = 4;
            matchedPairs = {};
            matchSelectedDesc = null;
            renderChallenge1();
          });
        } else {
          showFeedback(false, "Revisa el orden de las etapas", q.feedback_hint);
        }
      });
      return;
    }

    if (q.type === "matching") {
      const terms = [...q.pairs].sort((a, b) => a.term.localeCompare(b.term));
      const rowsHtml = q.pairs
        .map((p, idx) => {
          const termObj = terms[idx];
          const descMatched = Boolean(matchedPairs[p.id]);
          const termMatched = Object.values(matchedPairs).includes(termObj.term);
          return `
            <div class="match-row">
              <div class="match-desc ${matchSelectedDesc === p.id ? "selected" : ""} ${descMatched ? "matched" : ""}" data-did="${p.id}">
                ${p.description}
              </div>
              <div class="match-term ${termMatched ? "matched" : ""}" data-term="${termObj.term}">
                ${termObj.term}
              </div>
            </div>`;
        })
        .join("");

      root.innerHTML = `
        <section class="screen">
          <div class="top-bar">
            <button class="back-btn" id="back-c1">◀</button>
            <div class="top-title">Pregunta #4</div>
            <div class="spacer-34"></div>
          </div>
          <div class="screen-padded">
            <p class="question-prompt">${q.prompt}<br><small style="color:var(--muted);">Toca una descripción azul y luego su época correspondiente.</small></p>
            <div class="matching-list">${rowsHtml}</div>
          </div>
        </section>
      `;

      document.getElementById("back-c1").addEventListener("click", () => {
        c1Step = 3;
        renderChallenge1();
      });
      root.querySelectorAll(".match-desc").forEach((el) => {
        el.addEventListener("click", () => {
          if (matchedPairs[el.dataset.did]) return;
          matchSelectedDesc = el.dataset.did;
          renderChallenge1();
        });
      });
      root.querySelectorAll(".match-term").forEach((el) => {
        el.addEventListener("click", async () => {
          if (!matchSelectedDesc) return;
          const pair = q.pairs.find((p) => p.id === matchSelectedDesc);
          if (pair.term === el.dataset.term) {
            matchedPairs[pair.id] = pair.term;
            matchSelectedDesc = null;
            if (Object.keys(matchedPairs).length === q.pairs.length) {
              await postApi("/api/attempt", {
                challenge_id: c1.id,
                item_id: q.id,
                is_correct: true,
                unlock_badge: c1.badge,
              });
              showFeedback(true, "¡Reto 1 superado!", q.feedback_ok, () => {
                c1Step = 5;
                renderChallenge1();
              });
            } else {
              renderChallenge1();
            }
          } else {
            await postApi("/api/attempt", { challenge_id: c1.id, item_id: q.id, is_correct: false });
            showFeedback(false, "Intenta otra pareja", q.feedback_hint);
          }
        });
      });
    }
  }

  // ---------- Phase 3: Reto 2 (Arquitectos del conocimiento) ----------
  function renderChallenge2() {
    const c2 = curriculum.challenge_2;
    if (c2Step === 0) {
      root.innerHTML = `
        <section class="screen screen-gold">
          <div class="top-bar">
            <button class="back-btn" id="back-hub">◀</button>
            <div class="top-title top-title-white">QUIZ #2</div>
            <div class="spacer-34"></div>
          </div>
          <div class="quiz-intro-body">
            <div>
              <div class="flags-wrap">${svgFlags()}</div>
              <h2 class="quiz-intro-title">${c2.title}</h2>
              <p class="quiz-intro-desc">${c2.description}</p>
            </div>
            <button class="play-circle-btn" id="start-c2" aria-label="Iniciar reto 2">
              <span style="font-size:28px;color:#fff;margin-left:4px;">▶</span>
            </button>
          </div>
        </section>
      `;
      document.getElementById("back-hub").addEventListener("click", () => navigate("hub"));
      document.getElementById("start-c2").addEventListener("click", () => {
        c2Step = 1;
        activeNodeId = null;
        renderChallenge2();
      });
      return;
    }

    if (c2Step === 2) {
      root.innerHTML = `
        <section class="screen screen-gold">
          <div class="top-bar">
            <button class="back-btn" id="back-hub">◀</button>
            <div class="top-title top-title-white">Completado</div>
            <div class="spacer-34"></div>
          </div>
          <div class="completado-card" style="margin-top:64px;">
            <div class="medal-wrap">${svgMedal(2)}</div>
            <p style="font-size:15px;color:var(--muted);">¡Lo lograste! Has ganado la insignia de</p>
            <div class="badge-name-red">${c2.badge}</div>
            <div style="width:100%;margin-top:28px;display:flex;flex-direction:column;gap:10px;">
              <button class="btn btn-primary-green btn-block" id="next-c3">Siguiente reto: Viajeros</button>
              <button class="btn btn-outline btn-block" id="go-hub">Volver al Mapa</button>
            </div>
          </div>
        </section>
      `;
      document.getElementById("back-hub").addEventListener("click", () => navigate("hub"));
      document.getElementById("go-hub").addEventListener("click", () => navigate("hub"));
      document.getElementById("next-c3").addEventListener("click", () => {
        c3Step = 0;
        navigate("challenge_3");
      });
      return;
    }

    const doneNodes = c2.nodes.filter(
      (n) => appState.challenges[`c2_${n.id}`] && appState.challenges[`c2_${n.id}`].is_correct
    );
    const activeNode = c2.nodes.find((n) => n.id === activeNodeId);

    const nodesHtml = c2.nodes
      .map((n, idx) => {
        const isDone = appState.challenges[`c2_${n.id}`]?.is_correct;
        const spanClass = idx === 4 ? "span-2" : "";
        return `
          <button class="map-node-btn ${isDone ? "explored" : ""} ${spanClass}" data-nid="${n.id}">
            ${n.title} ${isDone ? "✓" : ""}
          </button>`;
      })
      .join("");

    let detailHtml = "";
    if (activeNode) {
      const opts = activeNode.options
        .map((o, idx) => `<button class="option-btn" data-idx="${idx}">${o}</button>`)
        .join("");
      detailHtml = `
        <div class="concept-detail-card" style="margin-top:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <strong>${activeNode.title}</strong>
            <span class="phase-tag">${activeNode.dates}</span>
          </div>
          <p>${activeNode.characteristics}</p>
          <div class="example-box" style="margin-bottom:8px;">${activeNode.changes_permanencies}</div>
          <div class="example-box" style="border-left-color:var(--blue-accent);margin-bottom:10px;">
            💬 ${activeNode.socialize_prompt}
          </div>
          <div style="font-size:13px;font-weight:800;">${activeNode.question}</div>
          <div class="option-list">${opts}</div>
        </div>`;
    }

    root.innerHTML = `
      <section class="screen screen-cream">
        <div class="top-bar">
          <button class="back-btn" id="back-c2">◀</button>
          <div class="top-title">Mapa Conceptual (${doneNodes.length}/5)</div>
          <div class="spacer-34"></div>
        </div>
        <div class="screen-padded">
          <p class="question-prompt">Presiona cada concepto para explorar las 5 épocas y responder su pregunta.</p>
          <div class="concept-map-wrap">
            <div class="map-root">${c2.root_label}</div>
            <div class="map-grid">${nodesHtml}</div>
          </div>
          ${detailHtml}
        </div>
      </section>
    `;

    document.getElementById("back-c2").addEventListener("click", () => {
      c2Step = 0;
      renderChallenge2();
    });
    root.querySelectorAll(".map-node-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeNodeId = btn.dataset.nid;
        renderChallenge2();
      });
    });
    if (activeNode) {
      root.querySelectorAll(".option-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const ok = Number(btn.dataset.idx) === activeNode.correct_index;
          const willFinish =
            ok &&
            c2.nodes.every(
              (n) => n.id === activeNode.id || appState.challenges[`c2_${n.id}`]?.is_correct
            );
          await postApi("/api/attempt", {
            challenge_id: c2.id,
            item_id: `c2_${activeNode.id}`,
            is_correct: ok,
            unlock_badge: willFinish ? c2.badge : null,
          });
          if (ok) {
            showFeedback(true, "¡Muy bien!", activeNode.feedback_ok, () => {
              activeNodeId = null;
              if (willFinish) c2Step = 2;
              renderChallenge2();
            });
          } else {
            showFeedback(false, "Revisa la tarjeta", "Lee las características de esta época e inténtalo de nuevo.");
          }
        });
      });
    }
  }

  // ---------- Phase 3: Reto 3 (Viajeros del tiempo) ----------
  function renderChallenge3() {
    const c3 = curriculum.challenge_3;
    if (c3Step === 0) {
      root.innerHTML = `
        <section class="screen screen-gold">
          <div class="top-bar">
            <button class="back-btn" id="back-hub">◀</button>
            <div class="top-title top-title-white">QUIZ #3</div>
            <div class="spacer-34"></div>
          </div>
          <div class="quiz-intro-body">
            <div>
              <div class="flags-wrap">${svgFlags()}</div>
              <h2 class="quiz-intro-title">${c3.title}</h2>
              <p class="quiz-intro-desc">${c3.description}</p>
            </div>
            <button class="play-circle-btn" id="start-c3" aria-label="Iniciar reto 3">
              <span style="font-size:28px;color:#fff;margin-left:4px;">▶</span>
            </button>
          </div>
        </section>
      `;
      document.getElementById("back-hub").addEventListener("click", () => navigate("hub"));
      document.getElementById("start-c3").addEventListener("click", () => {
        c3Step = 1;
        timelinePlacements = {};
        selectedTimelineCard = null;
        renderChallenge3();
      });
      return;
    }

    if (c3Step === 2) {
      root.innerHTML = `
        <section class="screen screen-gold">
          <div class="top-bar">
            <button class="back-btn" id="back-hub">◀</button>
            <div class="top-title top-title-white">Completado</div>
            <div class="spacer-34"></div>
          </div>
          <div class="completado-card" style="margin-top:64px;">
            <div class="medal-wrap">${svgMedal(3)}</div>
            <p style="font-size:15px;color:var(--muted);">¡Lo lograste! Has ganado la insignia de</p>
            <div class="badge-name-red">${c3.badge}</div>
            <p style="font-size:13px;color:var(--muted);margin-top:10px;">
              ¡Felicidades, ${escapeHtml(appState.student_name)}! Completaste toda la aventura de Guardianes del Tiempo.
            </p>
            <div style="width:100%;margin-top:22px;display:flex;flex-direction:column;gap:10px;">
              <button class="btn btn-primary-green btn-block" id="go-progress">Ver Mi Progreso</button>
              <button class="btn btn-outline btn-block" id="go-hub">Volver al Mapa</button>
            </div>
          </div>
        </section>
      `;
      document.getElementById("back-hub").addEventListener("click", () => navigate("hub"));
      document.getElementById("go-hub").addEventListener("click", () => navigate("hub"));
      document.getElementById("go-progress").addEventListener("click", () => navigate("progress"));
      return;
    }

    const placedCardIds = new Set(Object.values(timelinePlacements));
    const slotsHtml = c3.slots
      .map((slot, idx) => {
        const placedId = timelinePlacements[slot.id];
        const card = c3.cards.find((c) => c.id === placedId);
        const spanClass = idx === 4 ? "span-2" : "";
        return `
          <div class="timeline-slot ${card ? "filled" : ""} ${spanClass}" data-sid="${slot.id}">
            <div class="slot-date">${slot.date_label}</div>
            ${
              card
                ? `<div style="background:#fff;color:var(--ink);padding:4px 10px;border-radius:8px;font-size:12px;font-weight:800;margin-top:4px;">${card.label}</div>`
                : `<div class="slot-hint">${slot.event_hint}</div>`
            }
          </div>`;
      })
      .join("");

    const trayHtml = c3.cards
      .filter((c) => !placedCardIds.has(c.id))
      .map(
        (c) => `
        <div class="timeline-card ${selectedTimelineCard === c.id ? "selected" : ""}" draggable="true" data-cid="${c.id}">
          ${c.label}
        </div>`
      )
      .join("");

    root.innerHTML = `
      <section class="screen">
        <div class="top-bar">
          <button class="back-btn" id="back-c3">◀</button>
          <div class="top-title">Línea de Tiempo</div>
          <div class="spacer-34"></div>
        </div>
        <div class="screen-padded">
          <p class="question-prompt">${c3.instruction}</p>
          <div class="timeline-board">${slotsHtml}</div>
          <div class="timeline-tray">${trayHtml || "<small style='color:var(--muted);'>Todas las tarjetas ubicadas. ¡Comprueba tu orden!</small>"}</div>
          <button class="btn btn-primary-green btn-block" id="check-timeline">Comprobar línea de tiempo</button>
        </div>
      </section>
    `;

    document.getElementById("back-c3").addEventListener("click", () => {
      c3Step = 0;
      renderChallenge3();
    });

    root.querySelectorAll(".timeline-card").forEach((cardEl) => {
      cardEl.addEventListener("click", () => {
        selectedTimelineCard = cardEl.dataset.cid;
        renderChallenge3();
      });
      cardEl.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", cardEl.dataset.cid);
      });
    });

    root.querySelectorAll(".timeline-slot").forEach((slotEl) => {
      slotEl.addEventListener("click", () => {
        const sid = slotEl.dataset.sid;
        if (selectedTimelineCard) {
          timelinePlacements[sid] = selectedTimelineCard;
          selectedTimelineCard = null;
          renderChallenge3();
        } else if (timelinePlacements[sid]) {
          delete timelinePlacements[sid];
          renderChallenge3();
        }
      });
      slotEl.addEventListener("dragover", (e) => {
        e.preventDefault();
        slotEl.classList.add("drag-over");
      });
      slotEl.addEventListener("dragleave", () => slotEl.classList.remove("drag-over"));
      slotEl.addEventListener("drop", (e) => {
        e.preventDefault();
        slotEl.classList.remove("drag-over");
        const cid = e.dataTransfer.getData("text/plain");
        if (cid) {
          timelinePlacements[slotEl.dataset.sid] = cid;
          renderChallenge3();
        }
      });
    });

    document.getElementById("check-timeline").addEventListener("click", async () => {
      const allCorrect = c3.slots.every(
        (s) => timelinePlacements[s.id] === s.expected_card_id
      );
      await postApi("/api/attempt", {
        challenge_id: c3.id,
        item_id: "c3_timeline",
        is_correct: allCorrect,
        unlock_badge: allCorrect ? c3.badge : null,
      });
      if (allCorrect) {
        showFeedback(true, "¡Reto 3 superado!", c3.feedback_ok, () => {
          c3Step = 2;
          renderChallenge3();
        });
      } else {
        showFeedback(false, "Revisa las fechas", c3.feedback_hint);
      }
    });
  }

  // ---------- Formative Progress Dashboard ----------
  function renderProgress() {
    const diagTotal = curriculum.diagnostic_questions.length;
    const diagCorrect = Object.values(appState.diagnostic).filter((d) => d.is_correct).length;
    const chalCorrect = Object.values(appState.challenges).filter((c) => c.is_correct).length;
    const totalAttempts = Object.values(appState.challenges).reduce((sum, c) => sum + c.attempts, 0);

    root.innerHTML = `
      <section class="screen">
        <div class="top-bar">
          <button class="back-btn" id="back-hub">◀</button>
          <div class="top-title">Mi Progreso</div>
          <div class="spacer-34"></div>
        </div>
        <div class="screen-padded">
          <div class="stat-grid">
            <div class="stat-box">
              <div class="stat-val">${appState.explored_concepts.length}/5</div>
              <div class="stat-lbl">Conceptos explorados</div>
            </div>
            <div class="stat-box">
              <div class="stat-val">${diagCorrect}/${diagTotal}</div>
              <div class="stat-lbl">Diagnóstico</div>
            </div>
            <div class="stat-box">
              <div class="stat-val">${chalCorrect}</div>
              <div class="stat-lbl">Actividades superadas</div>
            </div>
            <div class="stat-box">
              <div class="stat-val">${appState.badges.length}/3</div>
              <div class="stat-lbl">Insignias ganadas</div>
            </div>
          </div>

          <div class="concept-detail-card">
            <strong>Evaluación Formativa (${escapeHtml(appState.student_name)})</strong>
            <p style="margin-top:6px;">
              Actividades superadas: <strong>${chalCorrect}</strong> • Intentos totales registrados: <strong>${totalAttempts}</strong>.
            </p>
            <p>Insignias: ${appState.badges.length ? appState.badges.join(", ") : "Ninguna aún"}.</p>
          </div>

          <button class="btn btn-red btn-block" id="btn-reset">Reiniciar progreso</button>
        </div>
      </section>
    `;

    document.getElementById("back-hub").addEventListener("click", () => navigate("hub"));
    document.getElementById("btn-reset").addEventListener("click", async () => {
      await postApi("/api/reset");
      showFeedback(true, "Progreso reiniciado", "Puedes comenzar una nueva aventura desde cero.", () =>
        navigate("hub")
      );
    });
  }

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function render() {
    switch (currentView) {
      case "home":
        return renderHome();
      case "instructions":
        return renderInstructions();
      case "hub":
        return renderHub();
      case "explore_route":
        return renderExploreRoute();
      case "explore_detail":
        return renderExploreDetail(viewParam);
      case "diagnostic":
        return renderDiagnostic();
      case "challenge_1":
        return renderChallenge1();
      case "challenge_2":
        return renderChallenge2();
      case "challenge_3":
        return renderChallenge3();
      case "progress":
        return renderProgress();
      default:
        return renderHome();
    }
  }

  render();
})();
