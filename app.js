(() => {
  "use strict";

  const APP = {
    config: {
      REACTION_TIME: 6000,
      ROUND_TIME: 30
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
      e.stopPropagation();
      fn(e);
    };

    el.ontouchend = (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn(e);
    };

    el.onpointerup = (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn(e);
    };
  }

  const UI = {
    show(screenId) {
      ["s-lobby", "s-wait", "s-game"].forEach((id) => {
        const el = $(id);
        if (el) el.classList.toggle("hidden", id !== screenId);
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
      $("ov-drink")?.classList.remove("hidden");

      if (navigator.vibrate) {
        try {
          navigator.vibrate([120, 70, 120]);
        } catch {}
      }

      clearTimeout(APP.state.timers.drinkOverlay);
      APP.state.timers.drinkOverlay = setTimeout(() => {
        $("ov-drink")?.classList.add("hidden");
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
      try {
        document.execCommand("copy");
      } catch {}
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
      if (gs.hist.length > 30) gs.hist.length = 30;
    },

    normalizeMates() {
      const gs = APP.state.gs;
      if (!gs) return;

      gs.mates = gs.mates.filter(
        (pair) =>
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
                try {
                  p.reconnect();
                } catch {}
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

    getArena() {
      return document.querySelector(".arena-wrap");
    },

    ensureStripExists() {
      let strip = Video.getStrip();
      if (strip) return strip;

      strip = document.createElement("div");
      strip.id = "vid-strip";
      strip.className = "vid-strip";
      return strip;
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
      const arena = Video.getArena();
      if (!arena) return;

      const strip = Video.ensureStripExists();

      if (strip.parentElement !== arena) {
        arena.appendChild(strip);
      }

      Video.updateLayoutClass();
    },

    async start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });

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
            try {
              pc.restartIce();
            } catch {}
          }
        };
      };

      if (call.peerConnection) hookPeerConnection();
      else setTimeout(hookPeerConnection, 300);
    },

    addBox(id, stream, muted = false, label = "") {
      const strip = Video.ensureStripExists();
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
      if (video.srcObject !== stream) {
        video.srcObject = stream;
      }

      if (muted) {
        video.muted = true;
        video.style.transform = "scaleX(-1)";
      }

      const labelEl = box.querySelector(".vl");
      labelEl.textContent = label || (id === "me" ? APP.state.me : "peer");

      Video.mountIntoArena();
      Renderer.refreshVideoTurnHighlight();
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
        <button id="b-togc" class="btn btn-s" style="padding:10px 12px;font-size:12px;${APP.state.camOn ? "color:#4ade80" : "color:#666"}">${APP.state.camOn ? "📹" : "🚫"}</button>
        <button id="b-togm" class="btn btn-s" style="padding:10px 12px;font-size:12px;${APP.state.micOn ? "color:#4ade80" : "color:#666"}">${APP.state.micOn ? "🎤" : "🔇"}</button>
      `;

      bindTap($("b-togc"), () => {
        const tracks = APP.state.localStream?.getVideoTracks() || [];
        tracks.forEach((t) => {
          t.enabled = !t.enabled;
        });
        APP.state.camOn = !APP.state.camOn;
        Video.renderControls(true);
      });

      bindTap($("b-togm"), () => {
        const tracks = APP.state.localStream?.getAudioTracks() || [];
        tracks.forEach((t) => {
          t.enabled = !t.enabled;
        });
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
        Game.addHistory({
          type: "timer",
          card: gs.timerCard,
          loser: a.loser,
          by: gs.players[gs.turn]
        });
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
      Renderer.refreshVideoTurnHighlight();
    },

    renderAll() {
      Renderer.renderWait();
      Renderer.renderConn();
      Renderer.renderGame();
      Renderer.handleReaction();

      if (APP.state.gs?.phase === "timed") Renderer.showTimer();
      else $("ov-timer")?.classList.add("hidden");

      if (APP.state.gs?.phase === "pick" && APP.state.gs.pick?.from === APP.state.me) Renderer.showPick();
      else $("ov-pick")?.classList.add("hidden");

      if (APP.state.gs?.phase === "rxRes" && APP.state.gs.rxRes) Renderer.showResults();
      else $("ov-results")?.classList.add("hidden");
    },

    renderWait() {
      UI.setText("w-code", APP.state.code);
      const gs = APP.state.gs;
      if (!gs) return;

      UI.setHTML(
        "w-players",
        gs.players
          .map(
            (p) => `
        <div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.03);font-size:14px">
          ${p}${p === APP.state.me ? ' <span style="color:var(--mt);font-size:10px">(you)</span>' : ""}
        </div>
      `
          )
          .join("")
      );

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
      const statusText = connected
        ? `${players > 1 ? players : linked} ${players > 1 ? "players" : "linked"}`
        : APP.state.peer
          ? "waiting"
          : "offline";

      const dotColor = connected ? "#4ade80" : APP.state.peer ? "var(--gd)" : "var(--ac)";
      const html = `<div class="status-dot" style="background:${dotColor}"></div><span style="color:var(--tx)">${statusText}</span>`;

      UI.setHTML("g-conn", html);
      UI.setHTML(
        "w-status",
        `<div class="status-bar" style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06)">${html}</div>`
      );
    },

    renderGame() {
      const gs = APP.state.gs;
      if (!gs) return;

      UI.setText("g-deck", `${gs.deck.length} left`);
      UI.setText("g-kings", `👑 ${gs.kc}/4`);

      UI.setHTML(
        "g-scores",
        gs.players
          .map(
            (p, i) => `
        <div style="display:flex;align-items:center;gap:4px;padding:8px 10px;border-radius:999px;background:${i === gs.turn ? "rgba(238,90,111,.12)" : "rgba(255,255,255,.04)"};border:1px solid ${i === gs.turn ? "rgba(238,90,111,.18)" : "rgba(255,255,255,.06)"};flex-shrink:0" class="${i === gs.turn ? "turn-pulse" : ""}">
          <span style="font-size:11px;color:var(--tx)">${p.slice(0, 6)}</span>
          <span style="font-family:var(--fm);font-size:11px;color:var(--ac)">🍺${gs.drinks[p] || 0}</span>
        </div>
      `
          )
          .join("")
      );

      const powerPills = [];
      if (gs.powers.heaven) powerPills.push(`<span class="power-pill">☝️ Heaven: ${gs.powers.heaven}</span>`);
      if (gs.powers.thumbmaster) powerPills.push(`<span class="power-pill">👍 Thumb: ${gs.powers.thumbmaster}</span>`);
      if (gs.powers.questionmaster) powerPills.push(`<span class="power-pill">❓ Questions: ${gs.powers.questionmaster}</span>`);

      if (powerPills.length) {
        $("g-power-bar")?.classList.remove("hidden");
        UI.setHTML("g-power-bar", powerPills.join(""));
      } else {
        $("g-power-bar")?.classList.add("hidden");
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

      UI.setHTML(
        "g-players-grid",
        gs.players
          .map((p, i) => {
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
          })
          .join("")
      );
    },

    renderMain() {
      const gs = APP.state.gs;
      const el = $("g-main");
      if (!gs || !el) return;

      if (gs.over) {
        const sorted = gs.players.slice().sort((a, b) => (gs.drinks[b] || 0) - (gs.drinks[a] || 0));

        el.innerHTML = `
          <div class="arena-wrap">
            <div class="arena-center">
              <div class="info-card gold">
                <div style="font-size:64px;margin-bottom:8px">🍺</div>
                <h3 style="font-size:24px;margin-bottom:10px">GAME OVER</h3>
                <div style="display:flex;flex-direction:column;gap:8px;margin:12px 0 14px">
                  ${sorted
                    .map(
                      (p, i) => `
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:14px;background:${i === 0 ? "rgba(238,90,111,.12)" : "rgba(255,255,255,.03)"};border:1px solid ${i === 0 ? "rgba(238,90,111,.22)" : "rgba(255,255,255,.06)"}">
                      <span style="font-family:var(--fm);color:${i === 0 ? "var(--ac)" : "var(--mt)"};font-size:12px">#${i + 1}</span>
                      <span style="flex:1;text-align:center;color:var(--tx);font-size:14px;font-weight:800">${p}</span>
                      <span class="drink-badge" style="font-size:10px">🍺 ${gs.drinks[p] || 0}</span>
                    </div>
                  `
                    )
                    .join("")}
                </div>
                <p style="color:var(--ac);font-size:14px;margin-bottom:14px">🏆 ${sorted[0]} drank the most!</p>
                <div class="info-actions">
                  <button class="btn btn-gd" id="b-reset">PLAY AGAIN</button>
                </div>
              </div>
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
          <div class="arena-center">
            <div class="turn-line">
              ${meTurn ? "YOUR TURN — tap the card!" : `${gs.players[gs.turn]}'s turn`}
            </div>

            <div class="${gs.flip ? "card-draw-anim" : ""}" style="display:flex;justify-content:center;">
              <div class="card-w ${gs.phase === "idle" || (gs.phase === "shown" && meTurn) ? "draw-enabled" : ""}" id="b-draw">
                <div class="card-i${gs.flip ? " flipped" : ""}">
                  <div class="card-f card-b">
                    <div style="width:78%;height:78%;border:1.5px solid rgba(238,90,111,.25);border-radius:14px;display:flex;align-items:center;justify-content:center">
                      <span style="font-size:34px;animation:glow 2s ease-in-out infinite">👑</span>
                    </div>
                  </div>
                  <div class="card-f card-fr">
                    <div style="position:absolute;top:8px;left:10px;font-family:var(--fd);font-weight:900;color:${SC[c.s]};line-height:1">
                      <div style="font-size:22px">${c.v}</div>
                      <div style="font-size:14px">${c.s}</div>
                    </div>
                    <span style="font-size:62px;color:${SC[c.s]}">${c.s}</span>
                    <div style="position:absolute;bottom:8px;right:10px;font-family:var(--fd);font-weight:900;color:${SC[c.s]};line-height:1;transform:rotate(180deg)">
                      <div style="font-size:22px">${c.v}</div>
                      <div style="font-size:14px">${c.s}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
      `;

      if (gs.phase === "idle") {
        html += `
          <div class="deck-bars">
            ${Array.from({ length: Math.min(20, Math.ceil(Math.max(gs.deck.length, 1) / 2.6)) })
              .map((_, i) => `<div style="opacity:${0.1 + i * 0.04}"></div>`)
              .join("")}
          </div>
        `;
      }

      if (gs.flip && r && gs.phase === "shown") {
        html += `
          <div class="info-card">
            <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:6px">
              <span style="font-size:22px">${r.i}</span>
              <h3>${c.v} — ${r.n}</h3>
            </div>
            ${r.t === "king" ? `<div class="info-meta">Kings: ${gs.kc}/4</div>` : ""}
            <p style="margin-top:8px">${r.d}</p>
            ${r.t === "power" ? `<div class="info-meta">⚡ Stored by ${gs.players[gs.turn]}</div>` : ""}
            <div class="info-actions">
              <button class="btn btn-s" id="b-next">Next Turn →</button>
            </div>
          </div>
        `;
      }

      if (gs.phase === "rule" && meTurn) {
        html += `
          <div class="info-card gold">
            <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:6px">
              <span style="font-size:22px">👑</span>
              <h3>MAKE A RULE</h3>
            </div>
            <div class="info-meta">Kings: ${gs.kc}/4</div>
            <div class="rule-box">
              <textarea id="i-rule" class="ta" placeholder="Type your rule..."></textarea>
            </div>
            <div class="info-actions">
              <button class="btn btn-gd" id="b-addrule">Add Rule</button>
              <button class="btn btn-s" id="b-skiprule">Skip</button>
            </div>
          </div>
        `;
      }

      if (gs.phase === "rule" && !meTurn) {
        html += `<div class="arena-mini-note">${gs.players[gs.turn]} is making a rule...</div>`;
      }

      if (gs.phase === "pick" && gs.pick?.from !== APP.state.me) {
        html += `<div class="arena-mini-note">${gs.pick.from} is picking...</div>`;
      }

      if (gs.phase === "timed") {
        html += `<div class="arena-mini-note" style="color:var(--gd)">⏱ Round in progress...</div>`;
      }

      if (gs.phase === "waterfall") {
        html += `
          <div class="info-card">
            <div style="font-size:36px;margin-bottom:4px">🌊</div>
            <h3 style="margin-bottom:2px">WATERFALL!</h3>
            <p style="margin-bottom:10px">Everyone drinks until the timer runs out!</p>
            <div id="wf-clock" style="font-family:var(--fd);font-size:44px;color:var(--gd);line-height:1;margin-bottom:10px"></div>
            <div class="progress-track" style="margin:0 auto 4px">
              <div id="wf-bar" class="progress-fill progress-gd"></div>
            </div>
          </div>
        `;
      }

      html += `
          </div>
        </div>
      `;

      el.innerHTML = html;

      const drawBtn = $("b-draw");
      if (drawBtn) {
        bindTap(drawBtn, () => {
          if (gs.phase === "idle" && meTurn) {
            Actions.run({ a: "draw", p: APP.state.me });
            return;
          }

          if (gs.phase === "shown" && meTurn) {
            Actions.run({ a: "next" });
          }
        });
      }

      if ($("b-next")) bindTap($("b-next"), () => Actions.run({ a: "next" }));

      if ($("b-addrule")) {
        bindTap($("b-addrule"), () => {
          const v = $("i-rule")?.value?.trim();
          if (v) Actions.run({ a: "addrule", rule: v });
        });
      }

      if ($("b-skiprule")) bindTap($("b-skiprule"), () => Actions.run({ a: "skiprule" }));

      Renderer.mountArenaVideos();
      Renderer.runWaterfallClock();
    },

    renderMyPowers() {
      const gs = APP.state.gs;
      const wrap = $("g-powers");
      const list = $("g-pw-list");
      if (!gs || !wrap || !list) return;

      if (gs.over) {
        wrap.classList.add("hidden");
        UI.setHTML("g-pw-list", "");
        return;
      }

      const myPowers = [];
      if (gs.powers.heaven === APP.state.me) myPowers.push({ k: "heaven", i: "☝️", l: "USE HEAVEN" });
      if (gs.powers.thumbmaster === APP.state.me) myPowers.push({ k: "thumbmaster", i: "👍", l: "USE THUMB" });
      if (gs.powers.questionmaster === APP.state.me) myPowers.push({ k: "questionmaster", i: "❓", l: "GOTCHA!" });

      if (!myPowers.length) {
        wrap.classList.add("hidden");
        UI.setHTML("g-pw-list", "");
        return;
      }

      wrap.classList.remove("hidden");
      UI.setHTML(
        "g-pw-list",
        myPowers
          .map(
            (pw) => `
        <button class="btn btn-s pw-b" data-k="${pw.k}">
          ${pw.i} ${pw.l}
        </button>
      `
          )
          .join("")
      );

      document.querySelectorAll(".pw-b").forEach((btn) => {
        bindTap(btn, () => {
          const k = btn.dataset.k;
          if (k === "questionmaster") Actions.run({ a: "gotcha", p: APP.state.me });
          else Actions.run({ a: "power", k, p: APP.state.me });
        });
      });
    },

    refreshVideoTurnHighlight() {
      const gs = APP.state.gs;
      if (!gs) return;

      const current = gs.players[gs.turn]?.toLowerCase();

      document.querySelectorAll(".vid-strip .vb").forEach((box) => {
        const label = box.querySelector(".vl")?.textContent?.toLowerCase() || "";
        box.classList.toggle("turn-box", !!current && label.includes(current));
      });
    },

    runWaterfallClock() {
      clearInterval(APP.state.timers.waterfall);

      const gs = APP.state.gs;
      if (!gs || gs.phase !== "waterfall" || !gs.wfStart || !gs.wfDuration) return;

      APP.state.timers.waterfall = setInterval(() => {
        const elapsed = (Date.now() - gs.wfStart) / 1000;
        const rem = Math.max(0, gs.wfDuration - elapsed);

        if ($("wf-clock")) $("wf-clock").textContent = `${rem.toFixed(1)}s`;
        if ($("wf-bar")) $("wf-bar").style.width = `${(rem / gs.wfDuration) * 100}%`;
        if ($("wf-clock")) $("wf-clock").style.color = rem <= 3 ? "var(--ac)" : "var(--gd)";

        if (rem <= 0) {
          clearInterval(APP.state.timers.waterfall);
          Actions.run({ a: "wfdone" });
        }
      }, 100);
    },

    showTimer() {
      const gs = APP.state.gs;
      if (!gs || gs.phase !== "timed" || !gs.timerStart) return;

      $("ov-timer")?.classList.remove("hidden");
      const r = RULES[gs.timerCard];

      UI.setText("tm-icon", r?.i || "⏱");
      UI.setText("tm-title", r?.n || "Round");
      UI.setText("tm-desc", r?.d || "");

      UI.setHTML(
        "tm-players",
        gs.players
          .map(
            (p) => `
        <button class="btn btn-s tm-fail" data-p="${p}" style="padding:10px 14px;font-size:12px">${p}</button>
      `
          )
          .join("")
      );

      document.querySelectorAll(".tm-fail").forEach((btn) => {
        bindTap(btn, () => {
          Actions.run({ a: "timerfail", loser: btn.dataset.p });
          $("ov-timer")?.classList.add("hidden");
        });
      });

      bindTap($("tm-skip"), () => {
        Actions.run({ a: "timerskip" });
        $("ov-timer")?.classList.add("hidden");
      });

      clearInterval(APP.state.timers.round);
      APP.state.timers.round = setInterval(() => {
        const elapsed = (Date.now() - gs.timerStart) / 1000;
        const rem = Math.max(0, APP.config.ROUND_TIME - elapsed);

        UI.setText("tm-clock", Math.ceil(rem));
        if ($("tm-bar")) $("tm-bar").style.width = `${(rem / APP.config.ROUND_TIME) * 100}%`;
        if ($("tm-clock")) $("tm-clock").style.color = rem <= 5 ? "var(--ac)" : "var(--gd)";

        if (rem <= 0) clearInterval(APP.state.timers.round);
      }, 100);
    },

    showPick() {
      const gs = APP.state.gs;
      const c = gs?.pick;
      if (!gs || !c) return;

      $("ov-pick")?.classList.remove("hidden");

      UI.setText("pk-icon", c.t === "you" ? "👉" : c.t === "mate" ? "🤝" : "❓");
      UI.setText("pk-title", c.t === "you" ? "YOU" : c.t === "mate" ? "MATE" : "GOTCHA");
      UI.setText(
        "pk-label",
        c.t === "you"
          ? "Pick someone to drink!"
          : c.t === "mate"
            ? "Pick your drinking mate!"
            : "Who answered?"
      );

      UI.setHTML(
        "pk-btns",
        gs.players
          .filter((p) => p !== APP.state.me)
          .map(
            (p) => `
          <button class="btn btn-s pk-c" data-n="${p}" style="text-align:center;padding:12px 14px">
            ${p} <span class="drink-badge">🍺${gs.drinks[p] || 0}</span>
          </button>
        `
          )
          .join("")
      );

      document.querySelectorAll(".pk-c").forEach((btn) => {
        bindTap(btn, () => {
          Actions.run({ a: "picked", from: gs.pick.from, target: btn.dataset.n });
          $("ov-pick")?.classList.add("hidden");
        });
      });
    },

    showResults() {
      const res = APP.state.gs?.rxRes;
      if (!res) return;

      $("ov-results")?.classList.remove("hidden");

      UI.setHTML(
        "res-list",
        res.rk
          .map((x, i) => {
            const last = i === res.rk.length - 1;
            return `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:14px;background:${last ? "rgba(238,90,111,.1)" : "rgba(255,255,255,.02)"};border:1px solid ${last ? "var(--ac)" : "transparent"}">
            <span style="font-family:var(--fm);color:${i === 0 ? "var(--gd)" : "var(--mt)"};font-weight:700;width:24px">#${i + 1}</span>
            <span style="flex:1;color:${last ? "var(--ac)" : "var(--tx)"};font-weight:700;font-size:14px">${x.p}</span>
            <span style="font-family:var(--fm);color:var(--mt);font-size:11px">${x.t !== null ? `${(x.t / 1000).toFixed(2)}s` : "TIMEOUT"}</span>
          </div>
        `;
          })
          .join("")
      );

      UI.setText("res-loser", res.loser ? `🍺 ${res.loser} drinks! (+1)` : "No loser");

      bindTap($("b-res-ok"), () => {
        Actions.run({ a: "dismiss" });
        $("ov-results")?.classList.add("hidden");
      });
    },

    handleReaction() {
      clearInterval(APP.state.timers.reaction);
      const gs = APP.state.gs;

      if (gs?.phase === "rx" && gs.rx) {
        $("ov-react")?.classList.remove("hidden");
        UI.setText("r-icon", gs.rx.t === "heaven" ? "☝️" : "👍");
        UI.setText("r-title", gs.rx.t === "heaven" ? "HEAVEN!" : "THUMBMASTER!");
        UI.setText("r-by", `by ${gs.rx.by}`);

        const tapped = gs.rx.taps[APP.state.me];
        $("r-tap-area")?.classList.toggle("hidden", !!tapped || APP.state.me === gs.rx.by);
        $("r-done")?.classList.toggle("hidden", !tapped && APP.state.me !== gs.rx.by);

        bindTap($("r-tap"), () => Actions.run({ a: "tap", p: APP.state.me }));

        APP.state.timers.reaction = setInterval(() => {
          const rem = Math.max(0, APP.config.REACTION_TIME - (Date.now() - gs.rx.st));
          if ($("r-bar")) $("r-bar").style.width = `${(rem / APP.config.REACTION_TIME) * 100}%`;
          UI.setText("r-time", `${(rem / 1000).toFixed(1)}s`);
          if (rem <= 0) clearInterval(APP.state.timers.reaction);
        }, 50);
      } else {
        $("ov-react")?.classList.add("hidden");
      }
    }
  };

  setInterval(() => {
    if (APP.state.isHost && APP.state.gs?.phase === "rx" && APP.state.gs.rx) {
      if (Date.now() - APP.state.gs.rx.st >= APP.config.REACTION_TIME) {
        Game.resolveReaction();
        PeerNet.broadcastState();
        Renderer.renderAll();
      }
    }
  }, 250);

  const App = {
    async createRoom() {
      const name = $("i-name")?.value.trim();
      if (!name) return alert("Enter your name!");

      APP.state.me = name;
      APP.state.code = Util.randCode();
      APP.state.isHost = true;

      UI.setHTML(
        "lobby-status",
        `<span class="spinner"></span> <span style="color:var(--mt);font-size:11px;margin-left:6px">Connecting...</span>`
      );

      if (typeof Peer === "undefined") {
        APP.state.peer = null;
        APP.state.gs = Game.createState([name]);
        UI.setHTML("lobby-status", `<span style="color:var(--ac);font-size:11px">⚠ offline mode</span>`);
        UI.show("s-wait");
        Renderer.renderAll();
        return;
      }

      try {
        APP.state.peer = await PeerNet.createPeer(`kk-${APP.state.code}`);
        APP.state.gs = Game.createState([name]);
        PeerNet.setupHost();
        UI.setHTML("lobby-status", "");
        UI.show("s-wait");
        Renderer.renderAll();
      } catch (e) {
        UI.setHTML("lobby-status", `<span style="color:var(--ac);font-size:11px">⚠ ${e.message || "Could not create room"}</span>`);
      }
    },

    async joinRoom() {
      const name = $("i-name")?.value.trim();
      const code = $("i-code")?.value.trim().toUpperCase();

      if (!name) return alert("Enter your name!");
      if (!code) return alert("Enter a room code!");

      APP.state.me = name;
      APP.state.code = code;
      APP.state.isHost = false;

      if (typeof Peer === "undefined") {
        return alert("Can't connect. Check internet and refresh.");
      }

      UI.setHTML(
        "lobby-status",
        `<span class="spinner"></span> <span style="color:var(--mt);font-size:11px;margin-left:6px">Joining...</span>`
      );

      try {
        const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4) || "plyr";
        APP.state.peer = await PeerNet.createPeer(`kk-${code}-${safeName}-${Math.random().toString(36).slice(2, 5)}`);

        const conn = APP.state.peer.connect(`kk-${code}`, { reliable: true });
        APP.state.conns[conn.peer] = conn;
        PeerNet.attachConnection(conn);

        const timeout = setTimeout(() => {
          UI.setHTML("lobby-status", `<span style="color:var(--ac);font-size:11px">⚠ Can't reach host</span>`);
        }, 10000);

        conn.on("open", () => {
          clearTimeout(timeout);
          PeerNet.send(conn, { t: "join", name });
          setTimeout(() => PeerNet.send(conn, { t: "join", name }), 900);
          UI.setHTML("lobby-status", "");
          UI.show("s-wait");
          Renderer.renderAll();
        });

        PeerNet.setupGuestListeners();
      } catch (e) {
        UI.setHTML("lobby-status", `<span style="color:var(--ac);font-size:11px">⚠ ${e.message || "Could not join room"}</span>`);
      }
    },

    startGame() {
      if (!APP.state.gs) return;
      UI.show("s-game");
      Renderer.renderAll();
      Renderer.mountArenaVideos();
    },

    showInvite() {
      UI.setText("m-code", APP.state.code);
      $("m-invite")?.classList.remove("hidden");
    },

    copyInvite() {
      const text = `Join my KAD KINGS game! Room Code: ${APP.state.code}`;

      Util.copyText(text)
        .then(() => {
          UI.setText("b-copy", "✅ Copied!");
          setTimeout(() => UI.setText("b-copy", "📋 Copy Invite"), 2000);
        })
        .catch(() => {
          Util.fallbackCopy(text);
          UI.setText("b-copy", "✅ Copied!");
          setTimeout(() => UI.setText("b-copy", "📋 Copy Invite"), 2000);
        });
    },

    toggleFullscreenMode() {
      APP.state.isFS = !APP.state.isFS;

      document.querySelectorAll("#s-wait,#s-game").forEach((el) => {
        el.style.position = APP.state.isFS ? "fixed" : "";
        el.style.inset = APP.state.isFS ? "0" : "";
        el.style.zIndex = APP.state.isFS ? "9990" : "";
        el.style.overflow = APP.state.isFS ? "auto" : "";
        el.style.background = APP.state.isFS ? "var(--bg)" : "";
      });

      UI.setText("b-fs", APP.state.isFS ? "✕ Full" : "⛶ Full");
    },

    async keepAwake() {
      try {
        if ("wakeLock" in navigator) {
          await navigator.wakeLock.request("screen");
        }
      } catch {}
    },

    bindEvents() {
      bindTap($("b-create"), App.createRoom);
      bindTap($("b-join"), App.joinRoom);
      bindTap($("b-start"), App.startGame);
      bindTap($("b-invite"), App.showInvite);
      bindTap($("b-inv2"), App.showInvite);
      bindTap($("b-copy"), App.copyInvite);
      bindTap($("b-close-invite"), () => $("m-invite")?.classList.add("hidden"));
      bindTap($("b-fs"), App.toggleFullscreenMode);
      bindTap($("b-cam"), Video.start);

      const inviteModal = $("m-invite");
      if (inviteModal) {
        inviteModal.onclick = (e) => {
          if (e.target === inviteModal) inviteModal.classList.add("hidden");
        };
      }

      const codeInput = $("i-code");
      if (codeInput) {
        codeInput.addEventListener("input", (e) => {
          e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
        });
      }
    },

    init() {
      App.bindEvents();
      Video.renderControls(false);
      App.keepAwake();
      Renderer.renderConn();
    }
  };

  App.init();
})();
