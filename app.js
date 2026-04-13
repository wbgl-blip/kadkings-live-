(() => {
  "use strict";

  const APP = {
    config: {
      REACTION_TIME: 6000,
      ROUND_TIME: 30,
      DEV: false
    },
    state: {
      me: "",
      code: "",
      isHost: false,
      peer: null,
      conns: {},
      gs: null,
      localStream: null,
      camOn: true,
      micOn: true,
      isFS: false,
      timers: {
        reaction: null,
        round: null,
        waterfall: null,
        drinkOverlay: null
      }
    }
  };

  const SUITS = ["♠", "♥", "♦", "♣"];
  const SC = {
    "♠": "#c8d6e5",
    "♥": "#ee5a6f",
    "♦": "#ee5a6f",
    "♣": "#c8d6e5"
  };
  const VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

  const RULES = {
    A: { n: "Waterfall", i: "🌊", d: "Everyone drinks until the timer ends.", t: "waterfall" },
    2: { n: "You", i: "👉", d: "Pick someone to drink.", t: "pick", pk: "you" },
    3: { n: "Me", i: "🍺", d: "You drink.", t: "instant" },
    4: { n: "Whores", i: "💃", d: "All ladies drink. Use house rules if needed.", t: "instant" },
    5: { n: "Never Have I Ever", i: "🖐️", d: "Play Never Have I Ever. Loser drinks.", t: "instant" },
    6: { n: "Dicks", i: "🕺", d: "Everyone drinks.", t: "instant" },
    7: { n: "Heaven", i: "☝️", d: "Stored power. Trigger anytime. Last to react drinks.", t: "power", pk: "heaven" },
    8: { n: "Mate", i: "🤝", d: "Pick a mate. When you drink, they also drink.", t: "pick", pk: "mate" },
    9: { n: "Rhyme", i: "🎤", d: "Timed rhyme round. First to fail drinks.", t: "timed" },
    10: { n: "Categories", i: "🗂️", d: "Timed categories round. First to fail drinks.", t: "timed" },
    J: { n: "Thumbmaster", i: "👍", d: "Stored power. Trigger anytime. Last to react drinks.", t: "power", pk: "thumbmaster" },
    Q: { n: "Question Master", i: "❓", d: "Stored power. Use GOTCHA when someone answers you.", t: "power", pk: "questionmaster" },
    K: { n: "Make a Rule", i: "👑", d: "Create a rule everyone must follow.", t: "king" }
  };

  const ICE = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun.relay.metered.ca:80" },
      { urls: "turn:global.relay.metered.ca:80", username: "e8dd65b92f94db5be7e30c2e", credential: "uLRhMHOkzmL+Cmhj" },
      { urls: "turn:global.relay.metered.ca:80?transport=tcp", username: "e8dd65b92f94db5be7e30c2e", credential: "uLRhMHOkzmL+Cmhj" },
      { urls: "turn:global.relay.metered.ca:443", username: "e8dd65b92f94db5be7e30c2e", credential: "uLRhMHOkzmL+Cmhj" },
      { urls: "turns:global.relay.metered.ca:443?transport=tcp", username: "e8dd65b92f94db5be7e30c2e", credential: "uLRhMHOkzmL+Cmhj" }
    ]
  };

  const $ = (id) => document.getElementById(id);

  function bindTap(el, fn) {
    if (!el) return;
    el.onclick = null;
    el.ontouchend = null;
    el.onpointerup = null;

    el.onclick = (e) => {
      e.preventDefault();
      fn(e);
    };
    el.ontouchend = (e) => {
      e.preventDefault();
      fn(e);
    };
    el.onpointerup = (e) => {
      e.preventDefault();
      fn(e);
    };
  }

  const UI = {
    show(screenId) {
      ["s-lobby", "s-wait", "s-game"].forEach((id) => {
        $(id).classList.toggle("hidden", id !== screenId);
      });
    },

    setHTML(id, html) {
      const el = $(id);
      if (el) el.innerHTML = html;
    },

    setText(id, text) {
      const el = $(id);
      if (el) el.textContent = text;
    },

    flashDrink(player, amount = 1) {
      if (player !== APP.state.me) return;
      UI.setHTML("yd-text", `YOU DRINK<br>🍺 +${amount}`);
      $("ov-drink").classList.remove("hidden");

      if (navigator.vibrate) {
        try { navigator.vibrate([120, 70, 120]); } catch {}
      }

      clearTimeout(APP.state.timers.drinkOverlay);
      APP.state.timers.drinkOverlay = setTimeout(() => {
        $("ov-drink").classList.add("hidden");
      }, 1800);
    }
  };

  const Util = {
    randCode() {
      return Math.random().toString(36).slice(2, 7).toUpperCase();
    },

    copyText(text) {
      try {
        return navigator.clipboard.writeText(text);
      } catch {
        return Promise.reject(new Error("Clipboard unavailable"));
      }
    },

    fallbackCopy(text) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;left:-9999px";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
  };

  const Game = {
    buildDeck() {
      const deck = [];
      for (const s of SUITS) {
        for (const v of VALUES) {
          deck.push({ s, v });
        }
      }
      for (let i = deck.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      return deck;
    },

    createState(players) {
      const drinks = {};
      players.forEach((name) => {
        drinks[name] = 0;
      });

      return {
        players: [...players],
        deck: Game.buildDeck(),
        turn: 0,
        kc: 0,
        hist: [],
        drawn: null,
        flip: false,
        over: false,
        powers: {
          heaven: null,
          thumbmaster: null,
          questionmaster: null
        },
        rules: [],
        rx: null,
        rxRes: null,
        phase: "idle",
        pick: null,
        drinks,
        mates: [],
        timerStart: null,
        timerCard: null,
        wfDuration: null,
        wfStart: null
      };
    },

    addHistory(entry) {
      const gs = APP.state.gs;
      if (!gs) return;
      gs.hist.unshift(entry);
      if (gs.hist.length > 24) gs.hist.length = 24;
    },

    normalizeMates() {
      const gs = APP.state.gs;
      if (!gs) return;
      gs.mates = gs.mates.filter((pair) =>
        Array.isArray(pair) &&
        pair.length === 2 &&
        pair[0] &&
        pair[1] &&
        pair[0] !== pair[1] &&
        gs.players.includes(pair[0]) &&
        gs.players.includes(pair[1])
      );
    },

    addDrink(player, amount = 1, visited = new Set()) {
      const gs = APP.state.gs;
      if (!gs || !player || visited.has(player)) return;
      visited.add(player);

      gs.drinks[player] = (gs.drinks[player] || 0) + amount;

      if (player === APP.state.me) {
        UI.flashDrink(player, amount);
      }

      Game.normalizeMates();

      for (const [from, to] of gs.mates) {
        if (from === player && to && !visited.has(to)) {
          Game.addDrink(to, amount, visited);
        }
      }
    },

    everyoneDrinks(amount = 1) {
      const gs = APP.state.gs;
      if (!gs) return;
      gs.players.forEach((p) => Game.addDrink(p, amount));
    },

    nextTurn() {
      const gs = APP.state.gs;
      if (!gs) return;

      gs.turn = (gs.turn + 1) % gs.players.length;
      gs.drawn = null;
      gs.flip = false;
      gs.phase = "idle";
      gs.pick = null;
      gs.rxRes = null;
      gs.timerStart = null;
      gs.timerCard = null;
      gs.wfDuration = null;
      gs.wfStart = null;

      if (gs.deck.length === 0) {
        gs.over = true;
      }
    },

    resolveReaction() {
      const gs = APP.state.gs;
      if (!gs || !gs.rx) return;

      const rx = gs.rx;
      const ranked = gs.players
        .filter((p) => p !== rx.by)
        .map((p) => ({ p, t: rx.taps[p] || null }))
        .sort((a, b) => {
          if (a.t === null && b.t === null) return 0;
          if (a.t === null) return 1;
          if (b.t === null) return -1;
          return a.t - b.t;
        });

      const loser = ranked.length ? ranked[ranked.length - 1].p : null;

      if (loser) {
        Game.addDrink(loser, 1);
        Game.addHistory({ type: "reaction", reaction: rx.t, by: rx.by, loser });
      }

      gs.rx = null;
      gs.rxRes = { rk: ranked, loser };
      gs.phase = "rxRes";
    }
  };

  const PeerNet = {
    async createPeer(id) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Connection timeout")), 10000);

        try {
          const p = new Peer(id, {
            debug: 0,
            config: ICE,
            pingInterval: 3000
          });

          p.on("open", () => {
            clearTimeout(timeout);
            resolve(p);
          });

          p.on("error", (e) => {
            clearTimeout(timeout);
            if (e.type === "unavailable-id") reject(new Error("Room code already in use"));
            else reject(e);
          });

          p.on("disconnected", () => {
            if (!p.destroyed) {
              setTimeout(() => {
                try { p.reconnect(); } catch {}
              }, 1500);
            }
          });
        } catch (e) {
          clearTimeout(timeout);
          reject(e);
        }
      });
    },

    send(conn, msg) {
      try {
        if (conn && conn.open) conn.send(JSON.stringify(msg));
      } catch {}
    },

    broadcast(msg) {
      Object.values(APP.state.conns).forEach((conn) => {
        PeerNet.send(conn, msg);
      });
    },

    broadcastState() {
      PeerNet.broadcast({ t: "gs", gs: APP.state.gs });
    },

    attachConnection(conn) {
      conn.on("data", (raw) => Actions.onData(raw, conn));
      conn.on("close", () => {
        delete APP.state.conns[conn.peer];
        Renderer.renderConn();
      });
      conn.on("error", () => {
        delete APP.state.conns[conn.peer];
        Renderer.renderConn();
      });
    },

    setupHost() {
      const peer = APP.state.peer;
      if (!peer) return;

      peer.on("connection", (conn) => {
        APP.state.conns[conn.peer] = conn;
        PeerNet.attachConnection(conn);

        conn.on("open", () => {
          Renderer.renderConn();
          setTimeout(() => {
            PeerNet.send(conn, { t: "gs", gs: APP.state.gs });
          }, 250);
        });
      });

      peer.on("call", (call) => {
        if (APP.state.localStream) call.answer(APP.state.localStream);
        else call.answer();
        Video.attachCall(call);
      });
    },

    setupGuestListeners() {
      const peer = APP.state.peer;
      if (!peer) return;

      peer.on("call", (call) => {
        if (APP.state.localStream) call.answer(APP.state.localStream);
        else call.answer();
        Video.attachCall(call);
      });
    }
  };

  const Video = {
    getStrip() {
      return $("vid-strip");
    },

    updateLayoutClass() {
      const strip = Video.getStrip();
      if (!strip) return;

      const count = strip.querySelectorAll(".vb").length;
      strip.classList.remove("one", "two", "three", "fourplus");

      if (count <= 1) strip.classList.add("one");
      else if (count === 2) strip.classList.add("two");
      else if (count === 3) strip.classList.add("three");
      else strip.classList.add("fourplus");
    },

    mountIntoArena() {
      const strip = Video.getStrip();
      const arena = document.querySelector(".arena-wrap");
      if (!strip || !arena) return;
      if (strip.parentElement !== arena) {
        arena.appendChild(strip);
      }
    },

    async start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        APP.state.localStream = stream;
        APP.state.camOn = true;
        APP.state.micOn = true;

        Video.addBox("me", stream, true, APP.state.me);
        Video.renderControls(true);

        Object.keys(APP.state.conns).forEach((id) => {
          try {
            const call = APP.state.peer.call(id, stream);
            if (call) Video.attachCall(call);
          } catch {}
        });

        if (!APP.state.isHost && APP.state.peer) {
          try {
            const hostId = `kk-${APP.state.code}`;
            const call = APP.state.peer.call(hostId, stream);
            if (call) Video.attachCall(call);
          } catch {}
        }
      } catch (e) {
        console.warn("Camera/mic error:", e);
        UI.setHTML("vid-ctrl-mini", `<span class="small-note">📷 off</span>`);
      }
    },

    attachCall(call) {
      let gotStream = false;

      call.on("stream", (stream) => {
        if (gotStream) return;
        gotStream = true;
        const label = Actions.nameFromPeerId(call.peer);
        Video.addBox(call.peer, stream, false, label);
      });

      call.on("close", () => Video.removeBox(call.peer));
      call.on("error", () => Video.removeBox(call.peer));

      const hookPeerConnection = () => {
        const pc = call.peerConnection;
        if (!pc) return;
        pc.oniceconnectionstatechange = () => {
          if (pc.iceConnectionState === "failed") {
            try { pc.restartIce(); } catch {}
          }
        };
      };

      if (call.peerConnection) hookPeerConnection();
      else setTimeout(hookPeerConnection, 300);
    },

    addBox(id, stream, muted = false, label = "") {
      const strip = Video.getStrip();
      if (!strip) return;

      let box = document.getElementById(`v-${CSS.escape(id)}`);
      if (!box) {
        box = document.createElement("div");
        box.id = `v-${id}`;
        box.className = "vb";
        box.innerHTML = `
          <video autoplay playsinline ${muted ? "muted" : ""}></video>
          <div class="vl"></div>
          ${muted ? "" : '<div class="vd"></div>'}
        `;
        strip.appendChild(box);
      }

      const video = box.querySelector("video");
      if (video.srcObject !== stream) video.srcObject = stream;
      if (muted) video.style.transform = "scaleX(-1)";

      const labelEl = box.querySelector(".vl");
      labelEl.textContent = label || (id === "me" ? APP.state.me : "peer");

      Video.updateLayoutClass();
      Renderer.refreshVideoTurnHighlight();
      Video.mountIntoArena();
    },

    removeBox(id) {
      const box = document.getElementById(`v-${CSS.escape(id)}`);
      if (box) box.remove();
      Video.updateLayoutClass();
      Renderer.refreshVideoTurnHighlight();
    },

    renderControls(started) {
      const el = $("vid-ctrl-mini");
      if (!el) return;

      if (!started) {
        el.innerHTML = `<button id="b-cam" class="btn btn-s cam-btn">📹</button>`;
        bindTap($("b-cam"), Video.start);
        return;
      }

      el.innerHTML = `
        <button id="b-togc" class="btn btn-s" style="padding:3px 6px;font-size:8px;${APP.state.camOn ? "color:#4ade80" : "color:#666"}">${APP.state.camOn ? "📹" : "🚫"}</button>
        <button id="b-togm" class="btn btn-s" style="padding:3px 6px;font-size:8px;${APP.state.micOn ? "color:#4ade80" : "color:#666"}">${APP.state.micOn ? "🎤" : "🔇"}</button>
      `;

      bindTap($("b-togc"), () => {
        const tracks = APP.state.localStream?.getVideoTracks() || [];
        tracks.forEach((t) => { t.enabled = !t.enabled; });
        APP.state.camOn = !APP.state.camOn;
        Video.renderControls(true);
      });

      bindTap($("b-togm"), () => {
        const tracks = APP.state.localStream?.getAudioTracks() || [];
        tracks.forEach((t) => { t.enabled = !t.enabled; });
        APP.state.micOn = !APP.state.micOn;
        Video.renderControls(true);
      });
    }
  };

  const Actions = {
    run(action) {
      action.t = "act";

      if (APP.state.isHost) {
        Actions.apply(action);
        PeerNet.broadcastState();
        Renderer.renderAll();
      } else {
        PeerNet.broadcast(action);
      }
    },

    onData(raw, conn) {
      let data;
      try {
        data = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        return;
      }

      if (data.t === "gs") {
        APP.state.gs = data.gs;
        Renderer.renderAll();
        return;
      }

      if (data.t === "join" && APP.state.isHost) {
        const gs = APP.state.gs;
        if (!gs.players.includes(data.name)) {
          gs.players.push(data.name);
          gs.drinks[data.name] = 0;
          Game.addHistory({ type: "join", player: data.name });
        }
        PeerNet.broadcastState();
        Renderer.renderAll();
        PeerNet.send(conn, { t: "gs", gs: APP.state.gs });
        return;
      }

      if (data.t === "act" && APP.state.isHost) {
        Actions.apply(data);
        PeerNet.broadcastState();
        Renderer.renderAll();
      }
    },

    nameFromPeerId(peerId) {
      const gs = APP.state.gs;
      if (!gs) return "peer";
      if (peerId === "me") return APP.state.me;
      if (peerId === `kk-${APP.state.code}`) return "host";

      const found = gs.players.find((name) =>
        peerId.includes(name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4))
      );

      return found || "peer";
    },

    apply(a) {
      const gs = APP.state.gs;
      if (!gs) return;

      if (a.a === "draw") {
        if (gs.deck.length === 0 || gs.flip || gs.over || gs.phase !== "idle") return;
        if (gs.players[gs.turn] !== a.p) return;

        const c = gs.deck.shift();
        const r = RULES[c.v];

        gs.drawn = c;
        gs.flip = true;
        Game.addHistory({ type: "draw", player: a.p, card: c, rule: r?.n || "" });

        if (c.v === "3") Game.addDrink(a.p, 1);
        if (c.v === "6") Game.everyoneDrinks(1);

        if (r.t === "king") {
          gs.kc += 1;
          gs.phase = "rule";
        } else if (r.t === "waterfall") {
          gs.phase = "waterfall";
          gs.wfDuration = Math.floor(Math.random() * 16) + 5;
          gs.wfStart = Date.now();
        } else if (r.t === "power") {
          gs.powers[r.pk] = a.p;
          gs.phase = "shown";
        } else if (r.t === "pick") {
          gs.pick = { t: r.pk, from: a.p };
          gs.phase = "pick";
        } else if (r.t === "timed") {
          gs.phase = "timed";
          gs.timerStart = Date.now();
          gs.timerCard = c.v;
        } else {
          gs.phase = "shown";
        }
      }

      if (a.a === "next") {
        Game.nextTurn();
      }

      if (a.a === "picked") {
        const pickType = gs.pick?.t;
        if (!pickType) return;

        if (pickType === "you") {
          Game.addDrink(a.target, 1);
          Game.addHistory({ type: "pick", pickType, from: a.from, target: a.target });
        }

        if (pickType === "mate") {
          gs.mates = gs.mates.filter((pair) => pair[0] !== a.from);
          gs.mates.push([a.from, a.target]);
          Game.addHistory({ type: "pick", pickType, from: a.from, target: a.target });
        }

        if (pickType === "gotcha") {
          Game.addDrink(a.target, 1);
          Game.addHistory({ type: "pick", pickType, from: a.from, target: a.target });
        }

        gs.pick = null;
        gs.phase = "shown";
      }

      if (a.a === "power") {
        gs.rx = { t: a.k, by: a.p, taps: {}, st: Date.now() };
        gs.phase = "rx";
        Game.addHistory({ type: "power", power: a.k, by: a.p });
      }

      if (a.a === "tap") {
        if (gs.rx && !gs.rx.taps[a.p] && a.p !== gs.rx.by) {
          gs.rx.taps[a.p] = Date.now() - gs.rx.st;
          const eligibleCount = gs.players.filter((p) => p !== gs.rx.by).length;
          if (Object.keys(gs.rx.taps).length >= eligibleCount) {
            Game.resolveReaction();
          }
        }
      }

      if (a.a === "gotcha") {
        gs.pick = { t: "gotcha", from: a.p };
        gs.phase = "pick";
      }

      if (a.a === "addrule") {
        if (a.rule && a.rule.trim()) {
          gs.rules.push(a.rule.trim());
          Game.addHistory({ type: "rule", player: gs.players[gs.turn], text: a.rule.trim() });
        }
        gs.phase = "shown";
      }

      if (a.a === "skiprule") {
        gs.phase = "shown";
      }

      if (a.a === "timerfail") {
        Game.addDrink(a.loser, 1);
        Game.addHistory({ type: "timer", card: gs.timerCard, loser: a.loser, by: gs.players[gs.turn] });
        gs.phase = "shown";
        gs.timerStart = null;
        gs.timerCard = null;
      }

      if (a.a === "timerskip") {
        gs.phase = "shown";
        gs.timerStart = null;
        gs.timerCard = null;
      }

      if (a.a === "wfdone") {
        gs.phase = "shown";
        gs.wfStart = null;
        gs.wfDuration = null;
      }

      if (a.a === "dismiss") {
        gs.rxRes = null;
        if (gs.flip) gs.phase = "shown";
        else gs.phase = "idle";
      }

      if (a.a === "reset") {
        const players = [...gs.players];
        APP.state.gs = Game.createState(players);
      }
    }
  };

  const Renderer = {
    mountArenaVideos() {
      Video.mountIntoArena();
      Video.updateLayoutClass();
      Renderer.refreshVideoTurnHighlight();
    },

    renderAll() {
      Renderer.renderWait();
      Renderer.renderConn();
      Renderer.renderGame();
      Renderer.handleReaction();

      if (APP.state.gs?.phase === "timed") Renderer.showTimer();
      else $("ov-timer").classList.add("hidden");

      if (APP.state.gs?.phase === "pick" && APP.state.gs.pick?.from === APP.state.me) Renderer.showPick();
      else $("ov-pick").classList.add("hidden");

      if (APP.state.gs?.phase === "rxRes" && APP.state.gs.rxRes) Renderer.showResults();
      else $("ov-results").classList.add("hidden");
    },

    renderWait() {
      UI.setText("w-code", APP.state.code);
      const gs = APP.state.gs;
      if (!gs) return;

      UI.setHTML("w-players", gs.players.map((p) => `
        <div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,.03);font-size:13px">
          ${p}${p === APP.state.me ? ' <span style="color:var(--mt);font-size:9px">(you)</span>' : ""}
        </div>
      `).join(""));

      const b = $("b-start");
      if (!b) return;

      b.disabled = false;
      b.textContent = gs.players.length >= 2 ? "START GAME" : "START SOLO (test)";
    },

    renderConn() {
      const gs = APP.state.gs;
      const linked = Object.keys(APP.state.conns).length;
      const players = gs ? gs.players.length : 0;

      const connected = linked > 0 || players > 1;
      const statusText = connected ? `${players > 1 ? players : linked} ${players > 1 ? "players" : "linked"}` : APP.state.peer ? "waiting" : "offline";
      const dotColor = connected ? "#4ade80" : APP.state.peer ? "var(--gd)" : "var(--ac)";
      const html = `<div class="status-dot" style="background:${dotColor}"></div><span style="color:var(--tx)">${statusText}</span>`;

      UI.setHTML("g-conn", html);
      UI.setHTML("w-status", `<div class="status-bar" style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);padding:4px 10px">${html}</div>`);
    },

    renderGame() {
      const gs = APP.state.gs;
      if (!gs) return;

      UI.setText("g-deck", `${gs.deck.length} left`);
      UI.setText("g-kings", `👑 ${gs.kc}/4`);

      UI.setHTML("g-scores", gs.players.map((p, i) => `
        <div style="display:flex;align-items:center;gap:2px;padding:2px 6px;border-radius:6px;background:${i === gs.turn ? 'rgba(238,90,111,.12)' : 'rgba(255,255,255,.04)'};border:1px solid ${i === gs.turn ? 'rgba(238,90,111,.18)' : 'rgba(255,255,255,.06)'};flex-shrink:0" class="${i === gs.turn ? "turn-pulse" : ""}">
          <span style="font-size:8px;color:var(--tx)">${p.slice(0, 4)}</span>
          <span style="font-family:var(--fm);font-size:8px;color:var(--ac)">🍺${gs.drinks[p] || 0}</span>
        </div>
      `).join(""));

      const powerPills = [];
      if (gs.powers.heaven) powerPills.push(`<span class="power-pill">☝️ Heaven: ${gs.powers.heaven}</span>`);
      if (gs.powers.thumbmaster) powerPills.push(`<span class="power-pill">👍 Thumb: ${gs.powers.thumbmaster}</span>`);
      if (gs.powers.questionmaster) powerPills.push(`<span class="power-pill">❓ Questions: ${gs.powers.questionmaster}</span>`);

      if (powerPills.length) {
        $("g-power-bar").classList.remove("hidden");
        UI.setHTML("g-power-bar", powerPills.join(""));
      } else {
        $("g-power-bar").classList.add("hidden");
        UI.setHTML("g-power-bar", "");
      }

      const extra = [];
      gs.mates.forEach(([from, to]) => {
        extra.push(`<span class="chip" style="color:var(--gd);border-color:rgba(240,192,64,.16)">🤝 ${from}→${to}</span>`);
      });
      gs.rules.forEach((rule) => {
        extra.push(`<span class="chip" style="color:var(--gd);border-color:rgba(240,192,64,.16)">📜 ${rule.length > 18 ? `${rule.slice(0, 18)}…` : rule}</span>`);
      });

      UI.setHTML("g-extra", extra.join(""));

      Renderer.renderPlayersGrid();
      Renderer.renderMain();
      Renderer.renderMyPowers();
      Renderer.refreshVideoTurnHighlight();
    },

    renderPlayersGrid() {
      const gs = APP.state.gs;
      if (!gs) return;

      UI.setHTML("g-players-grid", gs.players.map((p, i) => {
        const isTurn = gs.turn === i;
        const badges = [];

        if (gs.powers.heaven === p) badges.push(`<span class="mate-badge">☝️ Heaven</span>`);
        if (gs.powers.thumbmaster === p) badges.push(`<span class="mate-badge">👍 Thumb</span>`);
        if (gs.powers.questionmaster === p) badges.push(`<span class="mate-badge">❓ Questions</span>`);

        const mateTargets = gs.mates.filter((m) => m[0] === p).map((m) => m[1]);
        mateTargets.forEach((t) => badges.push(`<span class="mate-badge">🤝 ${t}</span>`));

        return `
          <div class="player-tile ${isTurn ? "turn" : ""}">
            <div class="player-top">
              <div class="player-dot"></div>
              <div class="player-name">${p}${p === APP.state.me ? " (you)" : ""}</div>
            </div>
            <div class="player-sub">
              <span class="drink-badge">🍺 ${gs.drinks[p] || 0}</span>
              ${isTurn ? `<span class="player-turn-tag">TURN</span>` : ""}
              ${badges.join("")}
            </div>
          </div>
        `;
      }).join(""));
    },

    renderMain() {
      const gs = APP.state.gs;
      const el = $("g-main");
      if (!gs || !el) return;

      if (gs.over) {
        const sorted = gs.players.slice().sort((a, b) => (gs.drinks[b] || 0) - (gs.drinks[a] || 0));

        el.innerHTML = `
          <div class="arena-wrap">
            <div style="text-align:center;position:relative;z-index:2;width:100%;max-width:360px;padding-top:22px;">
              <div style="font-size:62px;margin-bottom:8px;">🍺</div>
              <h2 style="font-family:var(--fd);color:var(--ac);font-size:28px;margin-bottom:14px;">GAME OVER</h2>
              <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
                ${sorted.map((p, i) => `
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-radius:14px;background:${i === 0 ? 'rgba(238,90,111,.12)' : 'rgba(255,255,255,.03)'};border:1px solid ${i === 0 ? 'rgba(238,90,111,.22)' : 'rgba(255,255,255,.06)'};">
                    <span style="font-family:var(--fm);color:${i === 0 ? 'var(--ac)' : 'var(--mt)'};font-size:13px;">#${i + 1}</span>
                    <span style="flex:1;text-align:center;color:var(--tx);font-size:15px;font-weight:700;">${p}</span>
                    <span class="drink-badge" style="font-size:11px">🍺 ${gs.drinks[p] || 0}</span>
                  </div>
                `).join("")}
              </div>
              <p style="color:var(--ac);font-size:16px;margin-bottom:18px;">🏆 ${sorted[0]} drank the most!</p>
              <button class="btn btn-gd" id="b-reset" style="padding:14px 30px;font-size:15px;">PLAY AGAIN</button>
            </div>
          </div>
        `;

        bindTap($("b-reset"), () => Actions.run({ a: "reset" }));
        Renderer.mountArenaVideos();
        return;
      }

      const meTurn = gs.players[gs.turn] === APP.state.me;
      const c = gs.drawn || { s: "♠", v: "K" };
      const r = gs.drawn ? RULES[gs.drawn.v] : null;

      let html = `
        <div class="arena-wrap">
          <div style="text-align:center;position:relative;z-index:2;width:100%;max-width:360px;">
            <div style="font-family:var(--fm);font-size:11px;margin-bottom:10px;color:${meTurn ? 'var(--gd)' : 'var(--mt)'};font-weight:${meTurn ? 700 : 400};text-align:center;">
              ${meTurn ? "YOUR TURN — tap the card!" : `${gs.players[gs.turn]}'s turn`}
            </div>

            <div class="${gs.flip ? "card-draw-anim" : ""}" style="margin-bottom:8px;display:flex;justify-content:center;">
              <div class="card-w ${gs.phase === "idle" && meTurn ? "draw-enabled" : ""}" id="b-draw">
                <div class="card-i${gs.flip ? " flipped" : ""}">
                  <div class="card-f card-b">
                    <div style="width:78%;height:78%;border:1.5px solid rgba(238,90,111,.25);border-radius:10px;display:flex;align-items:center;justify-content:center;">
                      <span style="font-size:30px;animation:glow 2s ease-in-out infinite;">👑</span>
                    </div>
                  </div>
                  <div class="card-f card-fr">
                    <div style="position:absolute;top:5px;left:8px;font-family:var(--fd);font-weight:900;color:${SC[c.s]};line-height:1;">
                      <div style="font-size:18px">${c.v}</div>
                      <div style="font-size:12px">${c.s}</div>
                    </div>
                    <span style="font-size:48px;color:${SC[c.s]}">${c.s}</span>
                    <div style="position:absolute;bottom:5px;right:8px;font-family:var(--fd);font-weight:900;color:${SC[c.s]};line-height:1;transform:rotate(180deg);">
                      <div style="font-size:18px">${c.v}</div>
                      <div style="font-size:12px">${c.s}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
      `;

      if (gs.phase === "idle") {
        html += `
          <div style="display:flex;gap:2px;margin-bottom:4px;justify-content:center;">
            ${Array.from({ length: Math.min(20, Math.ceil(Math.max(gs.deck.length, 1) / 2.6)) }).map((_, i) =>
              `<div style="width:2px;height:8px;border-radius:1px;background:var(--ac);opacity:${0.1 + i * 0.04}"></div>`
            ).join("")}
          </div>
        `;
      }

      if (gs.flip && r && gs.phase === "shown") {
        html += `
          <div style="background:rgba(238,90,111,.05);border:1px solid rgba(238,90,111,.1);border-radius:12px;padding:10px 16px;text-align:center;max-width:340px;margin:0 auto;animation:fadeIn .3s;">
            <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:3px;">
              <span style="font-size:20px">${r.i}</span>
              <h3 style="font-family:var(--fd);color:var(--ac);font-size:15px">${c.v} — ${r.n}</h3>
            </div>
            ${r.t === "king" ? `<p style="font-family:var(--fm);color:var(--gd);font-size:10px;margin-bottom:2px">Kings: ${gs.kc}/4</p>` : ""}
            <p style="color:var(--mt);font-size:11px;margin-bottom:6px;line-height:1.4">${r.d}</p>
            ${r.t === "power" ? `<p style="font-family:var(--fm);color:var(--gd);font-size:9px;margin-bottom:4px">⚡ Stored by ${
