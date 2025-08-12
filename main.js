/* Bonechain v3.1 – fixes:
   - Block chain counts BOTH directions (up to 3).
   - Enemies hitting baseline deal periodic damage and don’t walk off-screen.
*/

const W = 405, H = 720;
const ROWS = 18, COLS = 9;
const cellW = W/COLS, cellH = H/ROWS;
const BASE_Y = H * 0.94;     // baseline y
const BASE_HIT_Y = H * 0.93; // start damaging a tad before line

const cvs = document.getElementById('field');
const ctx = cvs.getContext('2d');
const waveEl = document.getElementById('wave');
const hpEl = document.getElementById('hp');
const soulsEl = document.getElementById('souls');
const btnPause = document.getElementById('btnPause');
const bar = document.getElementById('blockBar');

let running = true;
let last = performance.now();

const game = {
  wave: 1,
  necroHP: 50,
  souls: 0,
  units: [],
  proj: [],
  fx: [],
  spawnGate: 0.4,
  volleyT: 0
};

const TEAMS = {ALLY:'ally', ENEMY:'enemy'};

// -------- Blocks ----------
const TYPES = ['SK','AR','WR','DB'];
let blocks = [];
const BAR_SIZE = 12;

function refillBlocks(){
  while(blocks.length < BAR_SIZE){
    const k = TYPES[(Math.random()*TYPES.length)|0];
    blocks.push(k);
  }
  renderBar();
}
function renderBar(){
  bar.innerHTML = '';
  blocks.forEach((k,i)=>{
    const d = document.createElement('div');
    d.className = 'block';
    d.dataset.i = i; d.dataset.k = k;
    d.textContent = symbolFor(k);
    d.style.borderColor = colorFor(k);
    d.onclick = onBlockTap;
    bar.appendChild(d);
  });
}
function symbolFor(k){ return k==='SK'?'💀':k==='AR'?'🏹':k==='WR'?'👻':'☠️'; }
function colorFor(k){
  if (k==='SK') return '#a55';
  if (k==='AR') return '#5a5';
  if (k==='WR') return '#7a67c7';
  return '#b27b55';
}
function onBlockTap(e){
  const i = +e.currentTarget.dataset.i;
  const k = blocks[i];

  // NEW: expand both directions to get the contiguous run (max 3)
  let start = i, end = i;
  while (start-1 >= 0 && blocks[start-1] === k) start--;
  while (end+1 < blocks.length && blocks[end+1] === k) end++;
  const runLen = end - start + 1;
  const use = Math.min(3, runLen);

  // remove exactly `use` blocks from the left side of the run so it feels consistent
  blocks.splice(start, use);
  refillBlocks();

  cast(k, use);
}

// -------- Casting ----------
function cast(k, n){
  if (k==='SK'){
    if (n===1) spawnSquad('Skeleton', 1);
    if (n===2) spawnSquad('Skeleton', 2);
    if (n===3) spawnUnit('BoneKnight');
  }else if (k==='AR'){
    if (n===1) spawnSquad('Archer', 1);
    if (n===2) spawnSquad('Archer', 2);
    if (n===3){ spawnSquad('Archer', 2); game.volleyT = 4; fxText(W*0.5,H*0.82,'VOLLEY!'); }
  }else if (k==='WR'){
    if (n===1) spawnSquad('Wraith', 1);
    if (n===2) spawnSquad('Wraith', 2);
    if (n===3) spawnUnit('WraithElite');
  }else if (k==='DB'){
    const r = n===1?54:n===2?82:108;
    const stun = n===3?1.2:0;
    aoe(W*0.5, H*0.33, r, 10 + n*6, stun);
  }
}

// -------- Units & Stats ----------
function unit(team, kind, hp, atk, rngCells, cd, speed){
  return {team, kind, x:0, y:0, hp, max:hp, atk, rng:rngCells, cd, tAtk:0, speed};
}
function baseUnit(kind){
  switch(kind){
    case 'Skeleton':    return unit(TEAMS.ALLY,'SK', 22, 6, 1, 0.7, 160);
    case 'BoneKnight':  return unit(TEAMS.ALLY,'BK', 48,10, 1, 0.9, 150);
    case 'Archer':      return unit(TEAMS.ALLY,'AR', 16, 7, 4, 1.0, 165);
    case 'Wraith':      return unit(TEAMS.ALLY,'WR', 14, 9, 1, 0.6, 190);
    case 'WraithElite': return unit(TEAMS.ALLY,'WE', 26,14, 1, 0.5, 210);
    case 'Goblin':      return unit(TEAMS.ENEMY,'EG', 16, 5, 1, 0.9, 155);
    case 'Slinger':     return unit(TEAMS.ENEMY,'ES', 12, 6, 4, 1.05,165);
    case 'Brute':       return unit(TEAMS.ENEMY,'EB', 34, 9, 1, 1.0, 135);
  }
  return unit(TEAMS.ENEMY,'EG', 16, 5, 1, 1, 155);
}
function spawnUnit(kind){
  const u = baseUnit(kind);
  if (u.team===TEAMS.ALLY){
    u.x = W*0.22 + Math.random()*W*0.56;
    u.y = H*0.78 + (Math.random()*cellH - cellH/2);
  }else{
    u.x = W*0.15 + Math.random()*W*0.7;
    u.y = H*0.06 + (Math.random()*cellH*1.5 - cellH*0.75);
  }
  game.units.push(u);
}
function spawnSquad(kind, n){ for(let i=0;i<n;i++) spawnUnit(kind); }

// -------- Waves ----------
function spawnWave(n){
  let g = 4 + Math.floor(n*1.1);
  let s = Math.floor(n/2);
  let b = Math.floor((n-1)/3);
  for(let i=0;i<g;i++) spawnUnit('Goblin');
  for(let i=0;i<s;i++) spawnUnit('Slinger');
  for(let i=0;i<b;i++) spawnUnit('Brute');
}

// -------- AOE ----------
function aoe(xc, yc, r, dmg, stun){
  fxRing(xc,yc,r);
  for(const u of game.units){
    if (u.team!==TEAMS.ENEMY || u.hp<=0) continue;
    const dx = u.x - xc, dy = u.y - yc;
    if (Math.hypot(dx,dy) <= r){
      u.hp -= dmg;
      u.tAtk = Math.max(u.tAtk, stun||0);
      fxHit(u.x,u.y);
    }
  }
}

// -------- Helpers ----------
function nearest(u, team){
  let best=null, bd=1e9;
  for(const v of game.units){
    if (v.team!==team || v.hp<=0) continue;
    const d = Math.abs(v.x-u.x)+Math.abs(v.y-u.y);
    if (d<bd){bd=d; best=v;}
  }
  return best;
}
function nearestPointTarget(p){
  let want = p.team===TEAMS.ALLY ? TEAMS.ENEMY : TEAMS.ALLY;
  let best=null, bd=1e9;
  for(const u of game.units){
    if (u.team!==want || u.hp<=0) continue;
    const d = Math.abs(u.x-p.x)+Math.abs(u.y-p.y);
    if (d<bd){bd=d; best=u;}
  }
  return best;
}

// -------- Combat / Step ----------
function shoot(u, target, dmg){
  const ang = Math.atan2(target.y-u.y, target.x-u.x);
  game.proj.push({x:u.x, y:u.y, vx:320*Math.cos(ang), vy:320*Math.sin(ang), dmg, team:u.team, life:1.6});
}

function step(dt){
  if (!running) return;

  if (game.spawnGate>0){
    game.spawnGate -= dt;
    if (game.spawnGate<=0) spawnWave(game.wave);
  }
  if (game.volleyT>0) game.volleyT = Math.max(0, game.volleyT - dt);

  for(const u of game.units){
    if (u.hp<=0) continue;

    if (u.team===TEAMS.ALLY){
      const e = nearest(u, TEAMS.ENEMY); if (!e) continue;
      const dx = e.x - u.x, dy = e.y - u.y, dist = Math.hypot(dx,dy);
      const rngPx = u.rng * cellH * 0.9; u.tAtk -= dt;

      if (dist <= rngPx && u.tAtk<=0){
        if (u.rng>1) shoot(u, e, (game.volleyT>0 && u.kind==='AR')? u.atk*1.8 : u.atk);
        else { e.hp -= u.atk; fxHit(e.x,e.y); }
        u.tAtk = u.cd;
      }else{
        const sp = u.speed * dt;
        u.x += sp * Math.sign(dx) * 0.6;
        u.y += sp * Math.sign(dy);
      }
    }else{
      // enemies move DOWN; if allies exist, they fight them first
      const a = nearest(u, TEAMS.ALLY);
      const tx = a? a.x : u.x;
      const ty = a? a.y : BASE_Y;           // goal is bottom baseline
      const dx = tx - u.x, dy = ty - u.y, dist = Math.hypot(dx,dy);
      const rngPx = u.rng * cellH * 0.9; u.tAtk -= dt;

      // If they reached the base area, pin at baseline and hit base on cooldown
      if (!a && u.y >= BASE_HIT_Y){
        u.y = Math.min(u.y, BASE_Y);
        if (u.tAtk<=0){
          game.necroHP -= u.atk; fxText(W*0.5, H*0.95, '-'+u.atk);
          u.tAtk = u.cd;
        }
      }else if (dist <= rngPx && u.tAtk<=0){
        if (a){
          if (u.rng>1) shoot(u, a, u.atk);
          else { a.hp -= u.atk; fxHit(a.x,a.y); }
        }
        u.tAtk = u.cd;
      }else{
        const sp = u.speed * dt;
        u.x += sp * Math.sign(dx) * 0.4;
        u.y += Math.abs(sp); // bias downward
      }
    }

    // keep everyone inside the field
    u.x = Math.max(8, Math.min(W-8, u.x));
    u.y = Math.max(8, Math.min(H-8, u.y));
  }

  // projectiles
  for(const p of game.proj){
    p.x += p.vx*dt; p.y += p.vy*dt; p.life -= dt;
    if (p.life<=0) p.dead = true;
    const tgt = nearestPointTarget(p);
    if (tgt && Math.hypot(tgt.x-p.x,tgt.y-p.y) < 8){
      tgt.hp -= p.dmg; fxHit(tgt.x,tgt.y); p.dead = true;
    }
  }
  game.proj = game.proj.filter(p=>!p.dead);

  // cleanup
  for(const u of game.units) if (u.hp<=0 || u.y > H+24) u.dead = true; // cull off-screen
  game.units = game.units.filter(u=>!u.dead);

  // wave clear / defeat
  const enemiesLeft = game.units.some(u=>u.team===TEAMS.ENEMY);
  if (!enemiesLeft && game.spawnGate<=0){
    game.souls += 2 + Math.floor(game.wave/3);
    soulsEl.textContent = `Souls ${game.souls}`;
    fxText(W*0.5, H*0.08, `WAVE ${game.wave} CLEAR!`);
    game.wave++;
    waveEl.textContent = `Wave ${game.wave}`;
    game.spawnGate = 0.8;

    if (Math.random()<0.7) blocks.unshift('SK');
    if (Math.random()<0.5) blocks.unshift('AR');
    while(blocks.length>BAR_SIZE) blocks.pop();
    renderBar();
  }
  if (game.necroHP<=0){
    running=false;
    fxText(W*0.5, H*0.5, 'DEFEAT');
  }
  hpEl.textContent = `HP ${Math.max(0,game.necroHP)}`;
}

// -------- FX & Render ----------
function fxHit(x,y){ game.fx.push({x,y,t:0.15,type:'hit'}); }
function fxRing(x,y,r){ game.fx.push({x,y,t:0.4, r, type:'ring'}); }
function fxText(x,y,txt){ game.fx.push({x,y,t:1.0, text:txt, type:'text', yo:0}); }

function draw(){
  ctx.clearRect(0,0,W,H);
  // grid
  ctx.strokeStyle = '#1e1e24';
  for(let r=1;r<ROWS;r++){ ctx.beginPath(); ctx.moveTo(0,r*cellH); ctx.lineTo(W,r*cellH); ctx.stroke(); }
  for(let c=1;c<COLS;c++){ ctx.beginPath(); ctx.moveTo(c*cellW,0); ctx.lineTo(c*cellW,H); ctx.stroke(); }

  // baseline
  ctx.fillStyle = '#24242c';
  ctx.fillRect(W*0.05, BASE_Y, W*0.9, 4);

  // units
  for(const u of game.units){
    const ally = u.team===TEAMS.ALLY;
    ctx.fillStyle = ally ? '#5ed892' : '#e06a6a';
    if (u.kind==='AR') ctx.fillStyle = '#7ed0ff';
    if (u.kind==='WR'||u.kind==='WE') ctx.fillStyle = '#b69aff';
    if (u.kind==='BK') ctx.fillStyle = '#e0c078';
    ctx.fillRect(u.x-8,u.y-8,16,16);

    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(u.x-9,u.y+10,18,3.5);
    ctx.fillStyle = '#7cf470';
    ctx.fillRect(u.x-9,u.y+10, 18*(u.hp/u.max),3.5);
  }

  // projectiles
  ctx.fillStyle = '#fff';
  for(const p of game.proj){ ctx.beginPath(); ctx.arc(p.x,p.y,2.8,0,Math.PI*2); ctx.fill(); }

  // fx
  for(const f of game.fx){
    f.t -= 1/60;
    if (f.type==='hit'){
      ctx.strokeStyle = '#fff8';
      ctx.strokeRect(f.x-10,f.y-10,20,20);
    }else if(f.type==='ring'){
      ctx.strokeStyle = '#ffdd77aa';
      ctx.beginPath(); ctx.arc(f.x,f.y, f.r*(1-f.t/0.4), 0, Math.PI*2); ctx.stroke();
    }else if(f.type==='text'){
      f.yo -= 0.7;
      ctx.fillStyle = '#ffd45a';
      ctx.font = 'bold 16px system-ui';
      ctx.textAlign='center';
      ctx.fillText(f.text, f.x, f.y + f.yo);
    }
  }
  game.fx = game.fx.filter(f=>f.t>0);
}

// -------- Loop / UI ----------
function loop(now){
  const dt = Math.min((now-last)/1000, 1/30); last = now;
  if (running) step(dt);
  draw();
  requestAnimationFrame(loop);
}
btnPause.onclick = ()=>{ running = !running; btnPause.textContent = running?'⏸':'▶️'; };

refillBlocks();
requestAnimationFrame(loop);
