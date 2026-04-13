(() => {
  "use strict";

  const APP = {
    config: {
      REACTION_TIME: 6000,
      ROUND_TIME: 30,
      DEV: false,
      SPLASH_TIME: 2000,
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
      splashDone: false,
      timers: {
        reaction: null,
        round: null,
        waterfall: null,
        drinkOverlay: null,
      },
    },
  };

  const SUITS = ["♠", "♥", "♦", "♣"];
  const SC = {
    "♠": "#c8d6e5",
    "♥": "#ee5a6f",
    "♦": "#ee5a6f",
    "♣": "#c8d6e5",
  };
  const VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

  const RULES = {
    A: { n: "Waterfall", i: "🌊", d: "Everyone drinks until the timer ends.", t: "waterfall" },
    2: { n: "You", i: "👉", d: "Pick someone to drink.", t: "pick", pk: "you" },
    3: { n: "Me", i: "🍺", d: "You drink.", t: "instant" },
    4: { n: "Whores", i: "💃", d: "All ladies drink. Use house rules if needed.", t: "instant" },
    5: { n: "Never Have I Ever", i: "🖐️", d: "Play Never Have I Ever. Loser drinks.", t: "instant" },
    6: { n: "Dicks", i: "🕺", d: "Everyone drinks.", t: "instant" },
    7: {
      n: "Heaven",
      i: "☝️",
      d: "Stored power. Trigger anytime. Last to react drinks.",
      t: "power",
      pk: "heaven",
    },
    8: {
      n: "Mate",
      i: "🤝",
      d: "Pick a mate. When you drink, they also drink.",
      t: "pick",
      pk: "mate",
    },
    9: { n: "Rhyme", i: "🎤", d: "Timed rhyme round. First to fail drinks.", t: "timed" },
    10: {
      n: "Categories",
      i: "🗂️",
      d: "Timed categories round. First to fail drinks.",
      t: "timed",
    },
    J: {
      n: "Thumbmaster",
      i: "👍",
      d: "Stored power. Trigger anytime. Last to react drinks.",
      t: "power",
      pk: "thumbmaster",
    },
    Q: {
      n: "Question Master",
      i: "❓",
      d: "Stored power. Use GOTCHA when someone answers you.",
      t: "power",
      pk: "questionmaster",
    },
    K: { n: "Make a Rule", i: "👑", d: "Create a rule everyone must follow.", t: "king" },
  };

  const ICE = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun.relay.metered.ca:80" },
      {
        urls: "turn:global.relay.metered.ca:80",
        username: "e8dd65b92f94db5be7e30c2e",
        credential: "uLRhMHOkzmL+Cmhj",
      },
      {
        urls: "turn:global.relay.metered.ca:80?transport=tcp",
        username: "e8dd65b92f94db5be7e30c2e",
        credential: "uLRhMHOkzmL+Cmhj",
      },
      {
        urls: "turn:global.relay.metered.ca:443",
        username: "e8dd65b92f94db5be7e30c2e",
        credential: "uLRhMHOkzmL+Cmhj",
      },
      {
        urls: "turns:global.relay.metered.ca:443?transport=tcp",
        username: "e8dd65b92f94db5be7e30c2e",
        credential: "uLRhMHOkzmL+Cmhj",
      },
    ],
  };

  const $ = (id) => document.getElementById(id);

  function ensurePeerLoaded() {
    if (typeof window.Peer !== "undefined") {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      const urls = [
        "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js",
        "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js",
        "https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js",
      ];

      let index = 0;

      function tryNext() {
        if (typeof window.Peer !== "undefined") {
          resolve(true);
          return;
        }

        if (index >= urls.length) {
          resolve(false);
          return;
        }

        const script = document.createElement("script");
        script.src = urls[index++];
        script.async = true;
        script.onload = () => {
          if (typeof window.Peer !== "undefined") resolve(true);
          else tryNext();
        };
        script.onerror = () => tryNext();
        document.head.appendChild(script);
      }

      tryNext();
    });
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
      clearTimeout(APP.state.timers.drinkOverlay);
      APP.state.timers.drinkOverlay = setTimeout(() => {
        $("ov-drink")?.classList.add("hidden");
      }, 2200);
    },

    showBestScreen() {
      if (!APP.state.splashDone) return;

      if (!APP.state.gs) {
        UI.show("s-lobby");
        return;
      }

      if (APP.state.gs.started) {
        UI.show("s-game");
        return;
      }

      UI.show("s-wait");
    },
  };

  const Util = {
    log(...args) {
      if (APP.config.DEV) console.log(...args);
    },

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
    },
  };

  const Game = {
    buildDeck() {
      const deck = [];
      for (const s of SUITS) {
        for (const v of VALUES) {
          deck.push({ s, v });
        }
      }

      for (let i = deck.length - 1; i > 0; i--) {
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
        started: false,
        powers: {
          heaven: null,
          thumbmaster: null,
          questionmaster: null,
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
        wfStart: null,
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

      if (player === APP.state.me) UI.flashDrink(player, amount);

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
        gs.phase = "idle";
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
    },
  };

  const PeerNet = {
    async createPeer(id) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Connection timeout")), 10000);

        try {
          const p = new Peer(id, {
            debug: 0,
            config: ICE,
            pingInterval: 3000,
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
      const { conns } = APP.state;
      Object.values(conns).forEach((conn) => PeerNet.send(conn, msg));
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
          setTimeout(() => PeerNet.send(conn, { t: "gs", gs: APP.state.gs }), 250);
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
    },
  };

  const Video = {
    async start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        APP.state.localStream = stream;
        APP.state.camOn = true;
        APP.state.micOn = true;

        Video.addBox("me", stream, true, APP.state.me);
        Video.renderControls(true);

        const ids = Object.keys(APP.state.conns);
        ids.forEach((id) => {
          try {
            const call = APP.state.peer.call(id, stream);
            if (call) Video.attachCall(call);
          } catch {}
        });

        if (!APP.state.isHost && APP.state.peer) {
          try {
            const hostId = "kk-" + APP.state.code;
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
      const strip = $("vid-strip");
      if (!strip) return;

      const escapedId =
        typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/[^a-zA-Z0-9_-]/g, "");

      let box = document.getElementById("v-" + escapedId);

      if (!box) {
        box = document.createElement("div");
        box.id = "v-" + id;
        box.className = "vb";
        box.innerHTML = `
          <video autoplay playsinline ${muted ? "muted" : ""}></video>
          <div class="vl"></div>
          ${muted ? "" : '<div class="vd"></div>'}
        `;
        strip.appendChild(box);
      }

      const video = box.querySelector("video");
      if (video && video.srcObject !== stream) video.srcObject = stream;
      if (video && muted) video.style.transform = "scaleX(-1)";

      const labelEl = box.querySelector(".vl");
      if (labelEl) labelEl.textContent = label || (id === "me" ? APP.state.me : "peer");
    },

    removeBox(id) {
      const escapedId =
        typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/[^a-zA-Z0-9_-]/g, "");
      const box = document.getElementById("v-" + escapedId) || document.getElementById("v-" + id);
      if (box) box.remove();
    },

    renderControls(started) {
      const el = $("vid-ctrl-mini");
      if (!el) return;

      if (!started) {
        el.innerHTML = `<button id="b-cam" class="btn btn-s" style="padding:3px 8px;font-size:8px">📹</button>`;
        const camBtn = $("b-cam");
        if (camBtn) camBtn.onclick = Video.start;
        return;
      }

      el.innerHTML = `
        <button id="b-togc" class="btn btn-s" style="padding:3px 6px;font-size:8px;${APP.state.camOn ? "color:#4ade80" : "color:#666"}">${APP.state.camOn ? "📹" : "🚫"}</button>
        <button id="b-togm" class="btn btn-s" style="padding:3px 6px;font-size:8px;${APP.state.micOn ? "color:#4ade80" : "color:#666"}">${APP.state.micOn ? "🎤" : "🔇"}</button>
      `;

      const camToggle = $("b-togc");
      const micToggle = $("b-togm");

      if (camToggle) {
        camToggle.onclick = () => {
          const tracks = APP.state.localStream?.getVideoTracks() || [];
          tracks.forEach((t) => {
            t.enabled = !t.enabled;
          });
          APP.state.camOn = !APP.state.camOn;
          Video.renderControls(true);
        };
      }

      if (micToggle) {
        micToggle.onclick = () => {
          const tracks = APP.state.localStream?.getAudioTracks() || [];
          tracks.forEach((t) => {
            t.enabled = !t.enabled;
          });
          APP.state.micOn = !APP.state.micOn;
          Video.renderControls(true);
        };
      }
    },
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
        UI.showBestScreen();
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
      if (peerId === "kk-" + APP.state.code) return "host";

      const found = gs.players.find((name) =>
        peerId.includes(name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4))
      );

      return found || "peer";
    },

    apply(a) {
      const gs = APP.state.gs;
      if (!gs) return;

      if (a.a === "startgame") {
        gs.started = true;
        gs.phase = "idle";
        gs.over = false;
        return;
      }

      if (a.a === "draw") {
        if (gs.deck.length === 0 || gs.flip || gs.over || gs.phase !== "idle") return;
        if (gs.players[gs.turn] !== a.p) return;

        const c = gs.deck.shift();
        const r = RULES[c.v];

        gs.drawn = c;
        gs.flip = true;
        Game.addHistory({ type: "draw", player: a.p, card: c, rule: r?.n || "" });

        if (c.v === "3") {
          Game.addDrink(a.p, 1);
        }

        if (c.v === "6") {
          Game.everyoneDrinks(1);
        }

        if (r.t === "king") {
          gs.kc++;
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

        return;
      }

      if (a.a === "next") {
        Game.nextTurn();
        return;
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
        return;
      }

      if (a.a === "power") {
        gs.rx = { t: a.k, by: a.p, taps: {}, st: Date.now() };
        gs.phase = "rx";
        Game.addHistory({ type: "power", power: a.k, by: a.p });
        return;
      }

      if (a.a === "tap") {
        if (gs.rx && !gs.rx.taps[a.p] && a.p !== gs.rx.by) {
          gs.rx.taps[a.p] = Date.now() - gs.rx.st;
          const eligibleCount = gs.players.filter((p) => p !== gs.rx.by).length;
          if (Object.keys(gs.rx.taps).length >= eligibleCount) {
            Game.resolveReaction();
          }
        }
        return;
      }

      if (a.a === "gotcha") {
        gs.pick = { t: "gotcha", from: a.p };
        gs.phase = "pick";
        return;
      }

      if (a.a === "addrule") {
        if (a.rule && a.rule.trim()) {
          gs.rules.push(a.rule.trim());
          Game.addHistory({
            type: "rule",
            player: gs.players[gs.turn],
            text: a.rule.trim(),
          });
        }
        gs.phase = "shown";
        return;
      }

      if (a.a === "skiprule") {
        gs.phase = "shown";
        return;
      }

      if (a.a === "timerfail") {
        Game.addDrink(a.loser, 1);
        Game.addHistory({
          type: "timer",
          card: gs.timerCard,
          loser: a.loser,
          by: gs.players[gs.turn],
        });
        gs.phase = "shown";
        gs.timerStart = null;
        gs.timerCard = null;
        return;
      }

      if (a.a === "timerskip") {
        gs.phase = "shown";
        gs.timerStart = null;
        gs.timerCard = null;
        return;
      }

      if (a.a === "wfdone") {
        gs.phase = "shown";
        gs.wfStart = null;
        gs.wfDuration = null;
        return;
      }

      if (a.a === "dismiss") {
        gs.rxRes = null;
        gs.phase = gs.flip ? "shown" : "idle";
        return;
      }

      if (a.a === "reset") {
        const players = [...gs.players];
        APP.state.gs = Game.createState(players);
        APP.state.gs.started = true;
      }
    },
  };

  const Renderer = {
    renderAll() {
      UI.showBestScreen();
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
          <div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,.03);font-size:13px">
            ${p}${p === APP.state.me ? ' <span style="color:var(--mt);font-size:9px">(you)</span>' : ""}
          </div>
        `
          )
          .join("")
      );

      const b = $("b-start");
      if (!b) return;

      b.disabled = !APP.state.isHost;

      if (!APP.state.isHost) {
        b.textContent = "HOST STARTS GAME";
        return;
      }

      if (gs.players.length >= 2) b.textContent = "START GAME";
      else b.textContent = "START SOLO (test)";
    },

    renderConn() {
      const gs = APP.state.gs;
      const linked = Object.keys(APP.state.conns).length;
      const players = gs ? gs.players.length : 0;

      const connected = linked > 0 || players > 1;
      const statusText = connected ? (players > 1 ? players + " players" : linked + " linked") : APP.state.peer ? "waiting" : "offline";
      const dotColor = connected ? "#4ade80" : APP.state.peer ? "var(--gd)" : "var(--ac)";
      const html = `<div class="status-dot" style="background:${dotColor}"></div><span style="color:var(--tx)">${statusText}</span>`;

      UI.setHTML("g-conn", html);
      UI.setHTML(
        "w-status",
        `<div class="status-bar" style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);padding:4px 10px">${html}</div>`
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
        <div style="display:flex;align-items:center;gap:2px;padding:2px 6px;border-radius:6px;background:${i === gs.turn ? "rgba(238,90,111,.12)" : "rgba(255,255,255,.04)"};border:1px solid ${i === gs.turn ? "rgba(238,90,111,.18)" : "rgba(255,255,255,.06)"};flex-shrink:0" class="${i === gs.turn ? "turn-pulse" : ""}">
          <span style="font-size:8px;color:var(--tx)">${p.slice(0, 4)}</span>
          <span style="font-family:var(--fm);font-size:8px;color:var(--ac)">🍺${gs.drinks[p] || 0}</span>
        </div>
      `
          )
          .join("")
      );

      const extra = [];
      gs.mates.forEach(([from, to]) => {
        extra.push(
          `<span class="chip" style="color:var(--gd);border-color:rgba(240,192,64,.16)">🤝 ${from}→${to}</span>`
        );
      });
      gs.rules.forEach((rule) => {
        extra.push(
          `<span class="chip" style="color:var(--gd);border-color:rgba(240,192,64,.16)">📜 ${rule.length > 18 ? rule.slice(0, 18) + "…" : rule}</span>`
        );
      });
      UI.setHTML("g-extra", extra.join(""));

      const myPowers = [];
      if (gs.powers.heaven === APP.state.me) myPowers.push({ k: "heaven", i: "☝️", l: "HEAVEN" });
      if (gs.powers.thumbmaster === APP.state.me) myPowers.push({ k: "thumbmaster", i: "👍", l: "THUMB" });
      if (gs.powers.questionmaster === APP.state.me) {
        myPowers.push({ k: "questionmaster", i: "❓", l: "GOTCHA" });
      }

      const powersWrap = $("g-powers");
      if (myPowers.length && powersWrap) {
        powersWrap.style.display = "flex";

        UI.setHTML(
          "g-pw-list",
          myPowers
            .map(
              (pw) => `
            <button class="btn btn-s pw-b" data-k="${pw.k}" style="padding:4px 10px;font-size:9px;white-space:nowrap">
              <span style="margin-right:3px">${pw.i}</span>${pw.k === "questionmaster" ? "GOTCHA!" : "USE " + pw.l}
            </button>
          `
            )
            .join("")
        );

        document.querySelectorAll(".pw-b").forEach((btn) => {
          btn.onclick = () => {
            const k = btn.dataset.k;
            if (k === "questionmaster") Actions.run({ a: "gotcha", p: APP.state.me });
            else Actions.run({ a: "power", k, p: APP.state.me });
          };
        });
      } else if (powersWrap) {
        powersWrap.style.display = "none";
      }

      Renderer.renderMain();
    },

    renderMain() {
      const gs = APP.state.gs;
      const el = $("g-main");
      if (!gs || !el) return;

      if (gs.over) {
        const sorted = gs.players
          .slice()
          .sort((a, b) => (gs.drinks[b] || 0) - (gs.drinks[a] || 0));

        el.innerHTML = `
          <div style="text-align:center;animation:fadeIn .4s">
            <div style="font-size:50px;margin-bottom:6px">🍺</div>
            <h2 style="font-family:var(--fd);color:var(--ac);font-size:22px;margin-bottom:8px">GAME OVER</h2>
            <div style="margin-bottom:8px">
              <p style="font-family:var(--fm);color:var(--gd);font-size:10px">ALL 52 CARDS DRAWN</p>
            </div>
            <div style="margin-bottom:12px">
              ${sorted
                .map(
                  (p, i) => `
                <div style="display:flex;align-items:center;gap:8px;padding:4px 12px;border-radius:8px;margin-bottom:3px;${i === 0 ? "background:rgba(238,90,111,.1);border:1px solid rgba(238,90,111,.2)" : ""}">
                  <span style="font-family:var(--fm);color:${i === 0 ? "var(--ac)" : "var(--mt)"};font-size:12px;width:20px">#${i + 1}</span>
                  <span style="flex:1;color:var(--tx);font-size:13px">${p}</span>
                  <span class="drink-badge" style="font-size:10px">🍺 ${gs.drinks[p] || 0}</span>
                </div>
              `
                )
                .join("")}
            </div>
            <p style="color:var(--ac);font-size:13px;margin-bottom:12px">🏆 ${sorted[0]} drank the most!</p>
            <button class="btn btn-gd" id="b-reset" style="padding:10px 24px;font-size:14px">PLAY AGAIN</button>
          </div>
        `;

        const resetBtn = $("b-reset");
        if (resetBtn) resetBtn.onclick = () => Actions.run({ a: "reset" });
        return;
      }

      const meTurn = gs.players[gs.turn] === APP.state.me;
      const c = gs.drawn || { s: "♠", v: "K" };
      const r = gs.drawn ? RULES[gs.drawn.v] : null;

      let html = `
        <div style="font-family:var(--fm);font-size:11px;margin-bottom:6px;color:${meTurn ? "var(--gd)" : "var(--mt)"};font-weight:${meTurn ? 700 : 400}">
          ${meTurn ? "YOUR TURN — tap the card!" : gs.players[gs.turn] + "'s turn"}
        </div>

        <div class="${gs.flip ? "card-draw-anim" : ""}" style="margin-bottom:8px">
          <div class="card-w" id="b-draw">
            <div class="card-i${gs.flip ? " flipped" : ""}">
              <div class="card-f card-b">
                <div style="width:78%;height:78%;border:1.5px solid rgba(238,90,111,.25);border-radius:10px;display:flex;align-items:center;justify-content:center">
                  <span style="font-size:30px;animation:glow 2s ease-in-out infinite">👑</span>
                </div>
              </div>
              <div class="card-f card-fr">
                <div style="position:absolute;top:5px;left:8px;font-family:var(--fd);font-weight:900;color:${SC[c.s]};line-height:1">
                  <div style="font-size:18px">${c.v}</div>
                  <div style="font-size:12px">${c.s}</div>
                </div>
                <span style="font-size:48px;color:${SC[c.s]}">${c.s}</span>
                <div style="position:absolute;bottom:5px;right:8px;font-family:var(--fd);font-weight:900;color:${SC[c.s]};line-height:1;transform:rotate(180deg)">
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
          <div style="display:flex;gap:2px;margin-bottom:4px">
            ${Array.from({ length: Math.min(20, Math.ceil(gs.deck.length / 2.6)) })
              .map(
                (_, i) =>
                  `<div style="width:2px;height:8px;border-radius:1px;background:var(--ac);opacity:${0.1 + i * 0.04}"></div>`
              )
              .join("")}
          </div>
        `;
      }

      if (gs.flip && r && gs.phase === "shown") {
        html += `
          <div style="background:rgba(238,90,111,.05);border:1px solid rgba(238,90,111,.1);border-radius:12px;padding:10px 16px;text-align:center;max-width:340px;animation:fadeIn .3s">
            <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:3px">
              <span style="font-size:20px">${r.i}</span>
              <h3 style="font-family:var(--fd);color:var(--ac);font-size:15px">${c.v} — ${r.n}</h3>
            </div>
            ${r.t === "king" ? `<p style="font-family:var(--fm);color:var(--gd);font-size:10px;margin-bottom:2px">Kings: ${gs.kc}/4</p>` : ""}
            <p style="color:var(--mt);font-size:11px;margin-bottom:6px;line-height:1.4">${r.d}</p>
            ${r.t === "power" ? `<p style="font-family:var(--fm);color:var(--gd);font-size:9px;margin-bottom:4px">⚡ Stored by ${gs.players[gs.turn]}</p>` : ""}
            <button class="btn btn-s" id="b-next" style="padding:6px 16px;font-size:11px">${gs.deck.length === 0 ? "Finish Game →" : "Next Turn →"}</button>
          </div>
        `;
      }

      if (gs.phase === "rule" && meTurn) {
        html += `
          <div style="background:rgba(240,192,64,.05);border:1px solid rgba(240,192,64,.12);border-radius:12px;padding:10px 16px;text-align:center;max-width:340px;animation:fadeIn .3s">
            <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:4px">
              <span style="font-size:20px">👑</span>
              <h3 style="font-family:var(--fd);color:var(--gd);font-size:15px">MAKE A RULE</h3>
            </div>
            <p style="font-family:var(--fm);color:var(--gd);font-size:9px;margin-bottom:4px">Kings: ${gs.kc}/4</p>
            <textarea id="i-rule" class="ta" placeholder="Type your rule..." style="max-width:280px;margin-bottom:6px;font-size:12px;padding:8px 12px"></textarea>
            <div style="display:flex;gap:6px;justify-content:center">
              <button class="btn btn-gd" id="b-addrule" style="font-size:11px;padding:6px 16px">Add Rule</button>
              <button id="b-skiprule" style="background:none;border:none;color:var(--mt);font-size:10px;cursor:pointer">Skip</button>
            </div>
          </div>
        `;
      }

      if (gs.phase === "rule" && !meTurn) {
        html += `<p style="color:var(--mt);font-size:12px;text-align:center">${gs.players[gs.turn]} is making a rule...</p>`;
      }

      if (gs.phase === "pick" && gs.pick?.from !== APP.state.me) {
        html += `<p style="color:var(--mt);font-size:12px;text-align:center">${gs.pick.from} is picking...</p>`;
      }

      if (gs.phase === "timed") {
        html += `<p style="color:var(--gd);font-size:12px;text-align:center;animation:pulse 1.5s infinite">⏱ Round in progress...</p>`;
      }

      if (gs.phase === "waterfall") {
        html += `
          <div id="wf-display" style="text-align:center;animation:fadeIn .3s">
            <div style="font-size:36px;margin-bottom:4px">🌊</div>
            <h3 style="font-family:var(--fd);color:var(--ac);font-size:18px;margin-bottom:2px">WATERFALL!</h3>
            <p style="color:var(--mt);font-size:10px;margin-bottom:8px">Everyone drinks until the timer runs out!</p>
            <div id="wf-clock" style="font-family:var(--fd);font-size:42px;color:var(--gd)"></div>
            <div style="width:200px;height:5px;background:rgba(255,255,255,.06);border-radius:3px;margin:8px auto;overflow:hidden">
              <div id="wf-bar" style="height:100%;background:var(--gd);border-radius:3px;width:100%;transition:width .1s linear"></div>
            </div>
          </div>
        `;
      }

      el.innerHTML = html;

      const drawBtn = $("b-draw");
      if (drawBtn) {
        if (gs.phase === "idle" && meTurn) drawBtn.onclick = () => Actions.run({ a: "draw", p: APP.state.me });
        else drawBtn.onclick = null;
      }

      const nextBtn = $("b-next");
      if (nextBtn) nextBtn.onclick = () => Actions.run({ a: "next" });

      const addRuleBtn = $("b-addrule");
      if (addRuleBtn) {
        addRuleBtn.onclick = () => {
          const v = $("i-rule")?.value?.trim();
          if (v) Actions.run({ a: "addrule", rule: v });
        };
      }

      const skipRuleBtn = $("b-skiprule");
      if (skipRuleBtn) skipRuleBtn.onclick = () => Actions.run({ a: "skiprule" });

      Renderer.runWaterfallClock();
    },

    runWaterfallClock() {
      clearInterval(APP.state.timers.waterfall);
      const gs = APP.state.gs;
      if (!gs || gs.phase !== "waterfall" || !gs.wfStart || !gs.wfDuration) return;

      APP.state.timers.waterfall = setInterval(() => {
        const elapsed = (Date.now() - gs.wfStart) / 1000;
        const rem = Math.max(0, gs.wfDuration - elapsed);

        if ($("wf-clock")) $("wf-clock").textContent = rem.toFixed(1) + "s";
        if ($("wf-bar")) $("wf-bar").style.width = (rem / gs.wfDuration) * 100 + "%";
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
          <button class="btn btn-s tm-fail" data-p="${p}" style="padding:6px 14px;font-size:11px">${p}</button>
        `
          )
          .join("")
      );

      document.querySelectorAll(".tm-fail").forEach((btn) => {
        btn.onclick = () => {
          Actions.run({ a: "timerfail", loser: btn.dataset.p });
          $("ov-timer")?.classList.add("hidden");
        };
      });

      const skipBtn = $("tm-skip");
      if (skipBtn) {
        skipBtn.onclick = () => {
          Actions.run({ a: "timerskip" });
          $("ov-timer")?.classList.add("hidden");
        };
      }

      clearInterval(APP.state.timers.round);
      APP.state.timers.round = setInterval(() => {
        const elapsed = (Date.now() - gs.timerStart) / 1000;
        const rem = Math.max(0, APP.config.ROUND_TIME - elapsed);

        UI.setText("tm-clock", Math.ceil(rem));
        if ($("tm-bar")) $("tm-bar").style.width = (rem / APP.config.ROUND_TIME) * 100 + "%";
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
          <button class="btn btn-s pk-c" data-n="${p}" style="text-align:center">
            ${p} <span class="drink-badge">🍺${gs.drinks[p] || 0}</span>
          </button>
        `
          )
          .join("")
      );

      document.querySelectorAll(".pk-c").forEach((btn) => {
        btn.onclick = () => {
          Actions.run({ a: "picked", from: gs.pick.from, target: btn.dataset.n });
          $("ov-pick")?.classList.add("hidden");
        };
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
            <div style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-radius:10px;background:${last ? "rgba(238,90,111,.1)" : "rgba(255,255,255,.02)"};border:1px solid ${last ? "var(--ac)" : "transparent"}">
              <span style="font-family:var(--fm);color:${i === 0 ? "var(--gd)" : "var(--mt)"};font-weight:700;width:24px">#${i + 1}</span>
              <span style="flex:1;color:${last ? "var(--ac)" : "var(--tx)"};font-weight:600;font-size:14px">${x.p}</span>
              <span style="font-family:var(--fm);color:var(--mt);font-size:11px">${x.t !== null ? (x.t / 1000).toFixed(2) + "s" : "TIMEOUT"}</span>
            </div>
          `;
          })
          .join("")
      );

      UI.setText("res-loser", res.loser ? `🍺 ${res.loser} drinks! (+1)` : "No loser");

      const okBtn = $("b-res-ok");
      if (okBtn) {
        okBtn.onclick = () => {
          Actions.run({ a: "dismiss" });
          $("ov-results")?.classList.add("hidden");
        };
      }
    },

    handleReaction() {
      clearInterval(APP.state.timers.reaction);
      const gs = APP.state.gs;

      if (gs?.phase === "rx" && gs.rx) {
        $("ov-react")?.classList.remove("hidden");
        UI.setText("r-icon", gs.rx.t === "heaven" ? "☝️" : "👍");
        UI.setText("r-title", gs.rx.t === "heaven" ? "HEAVEN!" : "THUMBMASTER!");
        UI.setText("r-by", "by " + gs.rx.by);

        const tapped = gs.rx.taps[APP.state.me];
        $("r-tap-area")?.classList.toggle("hidden", !!tapped || APP.state.me === gs.rx.by);
        $("r-done")?.classList.toggle("hidden", !tapped && APP.state.me !== gs.rx.by);

        const tapBtn = $("r-tap");
        if (tapBtn) tapBtn.onclick = () => Actions.run({ a: "tap", p: APP.state.me });

        APP.state.timers.reaction = setInterval(() => {
          const rem = Math.max(0, APP.config.REACTION_TIME - (Date.now() - gs.rx.st));
          if ($("r-bar")) $("r-bar").style.width = (rem / APP.config.REACTION_TIME) * 100 + "%";
          UI.setText("r-time", (rem / 1000).toFixed(1) + "s");
          if (rem <= 0) clearInterval(APP.state.timers.reaction);
        }, 50);
      } else {
        $("ov-react")?.classList.add("hidden");
      }
    },
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
      if (!name) {
        alert("Enter your name!");
        return;
      }

      APP.state.me = name;
      APP.state.code = Util.randCode();
      APP.state.isHost = true;

      UI.setHTML(
        "lobby-status",
        `<span class="spinner"></span> <span style="color:var(--mt);font-size:11px;margin-left:6px">Connecting...</span>`
      );

      const loaded = await ensurePeerLoaded();

      if (!loaded || typeof Peer === "undefined") {
        APP.state.peer = null;
        APP.state.gs = Game.createState([name]);
        UI.setHTML("lobby-status", `<span style="color:var(--ac);font-size:11px">⚠ offline mode</span>`);
        UI.showBestScreen();
        Renderer.renderAll();
        return;
      }

      try {
        APP.state.peer = await PeerNet.createPeer("kk-" + APP.state.code);
        APP.state.gs = Game.createState([name]);
        PeerNet.setupHost();
        UI.setHTML("lobby-status", "");
        UI.showBestScreen();
        Renderer.renderAll();
      } catch (e) {
        UI.setHTML(
          "lobby-status",
          `<span style="color:var(--ac);font-size:11px">⚠ ${e.message || "Could not create room"}</span>`
        );
      }
    },

    async joinRoom() {
      const name = $("i-name")?.value.trim();
      const code = $("i-code")?.value.trim().toUpperCase();

      if (!name) {
        alert("Enter your name!");
        return;
      }

      if (!code) {
        alert("Enter a room code!");
        return;
      }

      APP.state.me = name;
      APP.state.code = code;
      APP.state.isHost = false;

      const loaded = await ensurePeerLoaded();

      if (!loaded || typeof Peer === "undefined") {
        alert("Can't connect. Check internet and refresh.");
        return;
      }

      UI.setHTML(
        "lobby-status",
        `<span class="spinner"></span> <span style="color:var(--mt);font-size:11px;margin-left:6px">Joining...</span>`
      );

      try {
        const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4) || "plyr";

        APP.state.peer = await PeerNet.createPeer(
          `kk-${code}-${safeName}-${Math.random().toString(36).slice(2, 5)}`
        );

        const conn = APP.state.peer.connect("kk-" + code, { reliable: true });
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
          UI.showBestScreen();
          Renderer.renderAll();
        });

        PeerNet.setupGuestListeners();
      } catch (e) {
        UI.setHTML(
          "lobby-status",
          `<span style="color:var(--ac);font-size:11px">⚠ ${e.message || "Could not join room"}</span>`
        );
      }
    },

    startGame() {
      if (!APP.state.gs || !APP.state.isHost) return;
      Actions.run({ a: "startgame" });
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

      UI.setText("b-fs", APP.state.isFS ? "✕" : "⛶ Full");
    },

    async keepAwake() {
      try {
        if ("wakeLock" in navigator) {
          await navigator.wakeLock.request("screen");
        }
      } catch {}
    },

    bindEvents() {
      const createBtn = $("b-create");
      const joinBtn = $("b-join");
      const startBtn = $("b-start");
      const inviteBtn = $("b-invite");
      const inviteBtn2 = $("b-inv2");
      const copyBtn = $("b-copy");
      const closeInviteBtn = $("b-close-invite");
      const fsBtn = $("b-fs");
      const camBtn = $("b-cam");
      const codeInput = $("i-code");

      if (createBtn) createBtn.onclick = App.createRoom;
      if (joinBtn) joinBtn.onclick = App.joinRoom;
      if (startBtn) startBtn.onclick = App.startGame;
      if (inviteBtn) inviteBtn.onclick = App.showInvite;
      if (inviteBtn2) inviteBtn2.onclick = App.showInvite;
      if (copyBtn) copyBtn.onclick = App.copyInvite;
      if (closeInviteBtn) closeInviteBtn.onclick = () => $("m-invite")?.classList.add("hidden");
      if (fsBtn) fsBtn.onclick = App.toggleFullscreenMode;
      if (camBtn) camBtn.onclick = Video.start;

      if (codeInput) {
        codeInput.addEventListener("input", (e) => {
          e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
        });
      }
    },

    runSplash() {
      setTimeout(() => {
        APP.state.splashDone = true;
        $("s-splash")?.classList.add("hidden");
        UI.showBestScreen();
      }, APP.config.SPLASH_TIME);
    },

    init() {
      App.bindEvents();
      Video.renderControls(false);
      App.keepAwake();
      Renderer.renderConn();
      App.runSplash();
    },
  };

  App.init();
})();
