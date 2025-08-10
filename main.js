/* Bonechain v2 (Portrait) – Necromancer + CQ-style block chains
   Portrait flow: enemies spawn at TOP and march DOWN. Your baseline near bottom.
   Blocks: SK (Skeleton), AR (Archer), WR (Wraith), DB (Death Blast)
   Combos: tap 1–3 identical adjacent blocks (to the right) to cast/summon.
*/

const W = 540, H = 960;          // canvas logical size (tall)
const ROWS = 16, COLS = 9;       // grid for AI (taller than wide)
const cellW = W/COLS, cellH = H/ROWS;

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
  units: [],     // {team:'ally'|'enemy', x,y, hp,max, atk, rng, cd,tAtk, speed, kind}
  proj: [],      // {x,y, vx,vy, dmg, team, life}
  fx: [],        // visuals
  spawnGate: 0.5, // delay then start first wave
  volleyT: 0      // archer volley buff timer
};

const TEAMS = {ALLY:'ally', ENEMY:'enemy'};

// ------- Blocks bar -------
const TYPES = ['SK','AR','WR','DB'];
let blocks = [];
const BAR_SIZE = 12; // two rows of 6

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
    d.dataset.i = i;
    d.dataset.k = k;
    d.textContent = symbolFor(k);
    d.style.borderColor = colorFor(k);
    d.onclick = onBlockTap;
    bar.appendChild(d);
  });
}
function symbolFor(k){
  return k==='SK'?'💀':k==='AR'?'🏹':k==='WR'?'👻':'☠️';
}
function colorFor(k){
  if (k==='SK') return '#a55';
  if (k==='AR') return '#5a5';
  if (k==='WR') return '#7a67c7';
  return '#b27b55';
}
function onBlockTap(e){
  const i = +e.currentTarget.dataset.i;
  const k = blocks[i];
  // count contiguous same blocks to the right (max 3)
  let count = 1;
  if (blocks[i+1]===k) count++;
  if (blocks[i+2]===k) count++;
  const use = Math.min(3,count);
  blocks.splice(i, use);
  refillBlocks();
  cast(k, use);
}

// ------- Casting / Spells -------
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
    const r = n===1?60:n===2?90:120;
    const stun = n===3?1.25:0;
    aoe(W*0.5, H*0.35, r, 10 + n*6, stun); // blast around upper-middle
  }
}

// ------- Units & Stats -------
function unit(team, kind, hp, atk, rngCells, cd, speed){
  return {team, kind, x:0, y:0, hp, max:hp, atk, rng:rngCells, cd, tAtk:0, speed};
}
function baseUnit(kind){
  switch(kind){
    case 'Skeleton':    return unit(TEAMS.ALLY,'SK', 22, 6, 1, 0.7, 170);
    case 'BoneKnight':  return unit(TEAMS.ALLY,'BK', 50,10, 1, 0.9, 150);
    case 'Archer':      return unit(TEAMS.ALLY,'AR', 16, 7, 4, 1.0, 170);
    case 'Wraith':      return unit(TEAMS.ALLY,'WR', 14, 9, 1, 0.6, 200);
    case 'WraithElite': return unit(TEAMS.ALLY,'WE', 26,14, 1, 0.5, 220);
    case 'Goblin':      return unit(TEAMS.ENEMY,'EG', 16, 5, 1, 0.9, 160);
    case 'Slinger':     return unit(TEAMS.ENEMY,'ES', 12, 6, 4, 1.05,170);
    case 'Brute':       return unit(TEAMS.ENEMY,'EB', 36, 9, 1, 1.0, 140);
  }
  return unit(TEAMS.ENEMY,'EG', 16, 5, 1, 1, 160);
}
function spawnUnit(kind){
  const u = baseUnit(kind);
  if (u.team===TEAMS.ALLY){
    // spawn near bottom third
    u.x = W*0.25 + Math.random()*W*0.5;
    u.y = H*0.75 + (Math.random()*cellH - cellH/2);
  }else{
    // enemies spawn near top region
    u.x = W*0.2 + Math.random()*W*0.6;
    u.y = H*0.08 + (Math.random()*cellH*2 - cellH);
  }
  game.units.push(u);
}
function spawnSquad(kind, n){ for(let i=0;i<n;i++) spawnUnit(kind); }

// ------- Waves -------
function spawnWave(n){
  // ramp with variety
  let g = 4 + Math.floor(n*1.2);
  let s = Math.floor(n/2);
  let b = Math.floor((n-1)/3);
  for(let i=0;i<g;i++) spawnUnit('Goblin');
  for(let i=0;i<s;i++) spawnUnit('Slinger');
  for(let i=0;i<b;i++) spawnUnit('Brute');
}

// ------- AOE -------
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

// ------- Targeting helpers -------
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
  let best=null, bd=1e9, want = p.team===TEAMS.ALLY ? TEAMS.ENEMY : TEAMS.ALLY;
  for(const u of game.units){
    if (u.team!==want || u.hp<=0) continue;
    const d = Math.abs(u.x-p.x)+Math.abs(u.y-p.y);
    if (d<bd){bd=d; best=u;}
  }
  return best;
}

// ------- Combat -------
function shoot(u, target, dmg){
  const ang = Math.atan2(target.y-u.y, target.x-u.x);
  game.proj.push({x:u.x, y:u.y, vx:320*Math.cos(ang), vy:320*Math.sin(ang), dmg, team:u.team, life:1.6});
}
function step(dt){
  if (!running) return;

  // start wave on gate
  if (game.spawnGate>0){
    game.spawnGate -= dt;
    if (game.spawnGate<=0) spawnWave(game.wave);
  }
  if (game.volleyT>0) game.volleyT = Math.max(0, game.volleyT - dt);

  // AI loop
  for(const u of game.units){
    if (u.hp<=0) continue;

    if (u.team===TEAMS.ALLY){
      const e = nearest(u, TEAMS.ENEMY); if (!e) continue;
      const dx = e.x - u.x, dy = e.y - u.y, dist = Math.hypot(dx,dy);
      const rngPx = u.rng * cellH * 0.9; // range in cell units
      u.tAtk -= dt;

      if (dist <= rngPx && u.tAtk<=0){
        if (u.rng>1) shoot(u, e, (game.volleyT>0 && u.kind==='AR')? u.atk*1.8 : u.atk);
        else { e.hp -= u.atk; fxHit(e.x,e.y); }
        u.tAtk = u.cd;
      }else{
        const sp = u.speed * dt;
        // move upward toward enemies (enemies come down)
        u.x += sp * Math.sign(dx) * 0.6;
        u.y += sp * Math.sign(dy);
      }
    }else{
      // enemies prefer to attack allies; else hit necro baseline
      const a = nearest(u, TEAMS.ALLY);
      const tx = a? a.x : W*0.5;
      const ty = a? a.y : H*0.86; // necro line
      const dx = tx - u.x, dy = ty - u.y, dist = Math.hypot(dx,dy);
      const rngPx = u.rng * cellH * 0.9;
      u.tAtk -= dt;

      if (dist <= rngPx && u.tAtk<=0){
        if (a){
          if (u.rng>1) shoot(u, a, u.atk);
          else { a.hp -= u.atk; fxHit(a.x,a.y); }
        }else{
          game.necroHP -= u.atk; fxText(W*0.5, H*0.9, '-'+u.atk);
        }
        u.tAtk = u.cd;
      }else{
        const sp = u.speed * dt;
        u.x += sp * Math.sign(dx) * 0.5;
        u.y += sp * Math.sign(dy); // generally downward
      }
    }
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

  // death cleanup
  for(const u of game.units) if (u.hp<=0) u.dead = true;
  game.units = game.units.filter(u=>!u.dead);

  // win/lose
  const enemiesLeft = game.units.some(u=>u.team===TEAMS.ENEMY);
  if (!enemiesLeft && game.spawnGate<=0){
    // wave clear
    game.souls += 2 + Math.floor(game.wave/3);
    soulsEl.textContent = `Souls ${game.souls}`;
    fxText(W*0.5, H*0.08, `WAVE ${game.wave} CLEAR!`);
    game.wave++;
    waveEl.textContent = `Wave ${game.wave}`;
    game.spawnGate = 0.8;

    // reward: bonus blocks
    if (Math.random()<0.7) blocks.unshift('SK');
    if (Math.random()<0.5) blocks.unshift('AR');
    while(blocks.length>BAR_SIZE) blocks.pop();
    renderBar();
  }
  if (game.necroHP<=0){
    running=false;
    fxText(W*0.5, H*0.5, 'DEFEAT');
  }

  hpEl.textContent = `HP ${Math.max(0, game.necroHP)}`;
}

// ------- FX & Render -------
function fxHit(x,y){ game.fx.push({x,y,t:0.15,type:'hit'}); }
function fxRing(x,y,r){ game.fx.push({x,y,t:0.4, r, type:'ring'}); }
function fxText(x,y,txt){ game.fx.push({x,y,t:1.0, text:txt, type:'text', yo:0}); }

function draw(){
  ctx.clearRect(0,0,W,H);

  // grid (portrait)
  ctx.strokeStyle = '#1e1e24';
  ctx.lineWidth = 1;
  for(let r=1;r<ROWS;r++){ ctx.beginPath(); ctx.moveTo(0,r*cellH); ctx.lineTo(W,r*cellH); ctx.stroke(); }
  for(let c=1;c<COLS;c++){ ctx.beginPath(); ctx.moveTo(c*cellW,0); ctx.lineTo(c*cellW,H); ctx.stroke(); }

  // necro baseline near bottom
  ctx.fillStyle = '#24242c';
  ctx.fillRect(W*0.05, H*0.88, W*0.9, 4);

  // units
  for(const u of game.units){
    const ally = u.team===TEAMS.ALLY;
    ctx.fillStyle = ally ? '#5ed892' : '#e06a6a';
    if (u.kind==='AR') ctx.fillStyle = '#7ed0ff';
    if (u.kind==='WR'||u.kind==='WE') ctx.fillStyle = '#b69aff';
    if (u.kind==='BK') ctx.fillStyle = '#e0c078';
    ctx.fillRect(u.x-9,u.y-9,18,18);

    // hp bar
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(u.x-10,u.y+11,20,4);
    ctx.fillStyle = '#7cf470';
    ctx.fillRect(u.x-10,u.y+11, 20*(u.hp/u.max),4);
  }

  // projectiles
  ctx.fillStyle = '#fff';
  for(const p of game.proj){
    ctx.beginPath(); ctx.arc(p.x,p.y,3,0,Math.PI*2); ctx.fill();
  }

  // fx
  for(const f of game.fx){
    f.t -= 1/60;
    if (f.type==='hit'){
      ctx.strokeStyle = '#fff8';
      ctx.strokeRect(f.x-11,f.y-11,22,22);
    }else if(f.type==='ring'){
      ctx.strokeStyle = '#ffdd77aa';
      ctx.beginPath(); ctx.arc(f.x,f.y, f.r*(1-f.t/0.4), 0, Math.PI*2); ctx.stroke();
    }else if(f.type==='text'){
      f.yo -= 0.7;
      ctx.fillStyle = '#ffd45a';
      ctx.font = 'bold 18px system-ui';
      ctx.textAlign='center';
      ctx.fillText(f.text, f.x, f.y + f.yo);
    }
  }
  game.fx = game.fx.filter(f=>f.t>0);
}

// ------- Loop & UI -------
function loop(now){
  const dt = Math.min((now-last)/1000, 1/30); last = now;
  if (running){ step(dt); }
  draw();
  requestAnimationFrame(loop);
}
btnPause.onclick = ()=>{ running = !running; btnPause.textContent = running?'⏸':'▶️'; };

// boot
refillBlocks();
requestAnimationFrame(loop);
