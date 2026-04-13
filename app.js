// ===============================
// KAD KINGS - UPGRADED CORE
// Layout + Power UI + Drink FX
// ===============================

const $ = (id) => document.getElementById(id);

// ------------------ STATE ------------------
let me="", code="", isHost=false, peer=null, conns={}, gs=null;

// ------------------ CONFIG ------------------
const RT = 6000;

// ------------------ RULES ------------------
const RULES = {
  7:{n:"Heaven",i:"☝️",t:"power",pk:"heaven"},
  J:{n:"Thumbmaster",i:"👍",t:"power",pk:"thumbmaster"},
  Q:{n:"Question Master",i:"❓",t:"power",pk:"questionmaster"},
};

// ------------------ GAME STATE ------------------
function newGame(players){
  return {
    players,
    turn:0,
    drinks:Object.fromEntries(players.map(p=>[p,0])),
    powers:{heaven:null,thumbmaster:null,questionmaster:null},
    phase:"idle"
  };
}

// ------------------ DRINK EFFECT ------------------
function drinkFX(player){
  if(player!==me) return;

  const el = document.createElement("div");
  el.innerHTML = "🍺 DRINK!";
  el.style.position="fixed";
  el.style.inset="0";
  el.style.display="flex";
  el.style.alignItems="center";
  el.style.justifyContent="center";
  el.style.fontSize="40px";
  el.style.color="#fff";
  el.style.background="rgba(238,90,111,.3)";
  el.style.zIndex="9999";
  el.style.animation="fadeOut 1.5s forwards";

  document.body.appendChild(el);
  setTimeout(()=>el.remove(),1500);

  if(navigator.vibrate) navigator.vibrate([200,100,200]);
}

// ------------------ POWER UI ------------------
function renderPowers(){
  const bar = $("power-bar");
  if(!bar) return;

  const p = gs.powers;

  bar.innerHTML = `
    ${p.heaven?`☝️ ${p.heaven}`:""}
    ${p.thumbmaster?`👍 ${p.thumbmaster}`:""}
    ${p.questionmaster?`❓ ${p.questionmaster}`:""}
  `;
}

// ------------------ PLAYER GRID ------------------
function renderPlayers(){
  const el = $("players");
  el.innerHTML = gs.players.map((p,i)=>{

    const isTurn = gs.turn===i;

    return `
      <div style="
        flex:1;
        padding:8px;
        border-radius:12px;
        text-align:center;
        background:${isTurn?'rgba(238,90,111,.2)':'rgba(255,255,255,.05)'};
        border:${isTurn?'2px solid #ee5a6f':'1px solid rgba(255,255,255,.1)'};
        font-weight:${isTurn?700:400};
      ">
        ${p}
        <div style="font-size:12px">🍺 ${gs.drinks[p]}</div>
      </div>
    `;
  }).join("");
}

// ------------------ MAIN RENDER ------------------
function render(){
  renderPlayers();
  renderPowers();
}

// ------------------ ACTIONS ------------------
function nextTurn(){
  gs.turn = (gs.turn+1)%gs.players.length;
  render();
}

function giveDrink(player){
  gs.drinks[player]++;
  drinkFX(player);
  render();
}

function setPower(type,player){
  gs.powers[type]=player;
  render();
}

// ------------------ TEST BUTTONS ------------------
function bindTest(){
  $("btn-drink").onclick = ()=>giveDrink(me);
  $("btn-next").onclick = nextTurn;
  $("btn-heaven").onclick = ()=>setPower("heaven",me);
  $("btn-thumb").onclick = ()=>setPower("thumbmaster",me);
}

// ------------------ INIT ------------------
function init(){
  me = "You";
  gs = newGame(["You","Friend"]);
  bindTest();
  render();
}

init();
