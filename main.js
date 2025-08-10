/* Bonechain v1 – Necromancer + Crusaders-Quest style block chains
   Blocks: SK (Skeleton), AR (Archer), WR (Wraith), DB (Death Blast)
   Tap 1–3 contiguous identical blocks to cast:
   SK: 1=1 Skeleton, 2=2 Skeletons, 3=1 Bone Knight
   AR: 1=1 Archer,   2=2 Archers,   3=Volley buff + 2 Archers
   WR: 1=1 Wraith,   2=2 Wraiths,   3=Elite Wraith (higher atk/speed)
   DB: 1=Small AOE,  2=Medium AOE,  3=Big AOE + stun
*/

const W = 960, H = 540;         // canvas logical size (scaled by CSS)
const ROWS = 6, COLS = 14;      // soft grid for AI
const cellW = W/COLS, cellH = H/ROWS;

const cvs = document.getElementById('field');
const ctx = cvs.getContext('2d');
const waveEl = document.getElementById('wave');
const hpEl = document.getElementById('hp');
const soulsEl = document.getElementById('souls');
const btnPause = document.getElementById('btnPause');
const bar = document.getElementById('blockBar');

let running = true;
let t = 0;          // seconds
let dtCap = 1/30;
let last = performance.now();

const game = {
  wave: 1,
  necroHP: 50,
  souls: 0,
  units: [],     // {team:'ally'|'enemy', x,y, vx,vy, hp,max, atk, rng, cd,tAtk, speed, kind}
  proj: [],      // {x,y, vx,vy, dmg, team, life}
  fx: [],        // {x,y, t, type}
  spawnCD: 0,
  volleyT: 0,    // archer volley from AR-3
};

const TEAMS = {ALLY:'ally', ENEMY:'enemy'};

// ------- Blocks bar -------
const TYPES = ['SK','AR','WR','DB'];
let blocks = [];
const BAR_SIZE = 8;

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
  return k==='SK'?'#a55':'#5a5' && k==='AR' ? '#5a5' : k==='WR' ? '#7a67c7' : '#b27b55';
}
function onBlockTap(e){
  const i = +e.currentTarget.dataset.i;
  const k = blocks[i];
  // count contiguous to the right with same key (max 3)
  let count = 1;
  if (blocks[i+1]===k) count++;
  if (blocks[i+2]===k) count++;
  const use = Math.min(3,count);
  // consume
  blocks.splice(i, use);
  refillBlocks();
  cast(k, use);
}

// ------- Casting → spawns / buffs / spells -------
function cast(k, n){
  if (k==='SK'){
    if (n===1) spawnSquad('Skeleton', 1);
    if (n===2) spawnSquad('Skeleton', 2);
    if (n===3) spawnUnit('BoneKnight');
  }else if (k==='AR'){
    if (n===1) spawnSquad('Archer', 1);
    if (n===2) spawnSquad('Archer', 2);
    if (n===3){ spawnSquad('Archer', 2); game.volleyT = 4; fxText(W*0.5,H-60,'VOLLEY!'); }
  }else if (k==='WR'){
    if (n===1) spawnSquad('Wraith', 1);
    if (n===2) spawnSquad('Wraith', 2);
    if (n===3) spawnUnit('WraithElite');
  }else if (k==='DB'){
    const r = n===1?60:n===2?90:120;
    const stun = n===3?1.5:0;
    aoe(H*0.45, r, 12+(n*6), stun);
  }
}

// ------- Units & Stats -------
function spawnSquad(kind, n){
  for(let i=0;i<n;i++) spawnUnit(kind);
}
function spawnUnit(kind){
  const u = baseUnit(kind);
  // spawn near bottom half across lanes
  u.x = W*0.2 + Math.random()*W*0.3;
  u.y = H*0.65 + (Math.random()*cellH - cellH/2);
  game.units.push(u);
}
function baseUnit(kind){
  const k = kind;
  if (k==='Skeleton') return unit(TEAMS.ALLY, 'SK', 20, 20, 6, 1, 0.7, 70, 0.8);
  if (k==='BoneKnight')return unit(TEAMS.ALLY, 'BK', 55, 55, 10,1, 0.9, 60, 0.65);
  if (k==='Archer')   return unit(TEAMS.ALLY, 'AR', 16, 16, 7, 4, 1.0, 70, 0.9);
  if (k==='Wraith')   return unit(TEAMS.ALLY, 'WR', 14, 14, 9, 1, 0.6, 95, 1.1);
  if (k==='WraithElite')return unit(TEAMS.ALLY,'WE', 26, 26, 14,1, 0.5, 105, 1.2);
  // enemies
  if (k==='Goblin')   return unit(TEAMS.ENEMY,'EG', 18, 18, 5, 1, 0.9, 70, 0.9);
  if (k==='Slinger')  return unit(TEAMS.ENEMY,'ES', 12, 12, 6, 4, 1.1, 70, 0.9);
  if (k==='Brute')    return unit(TEAMS.ENEMY,'EB', 36, 36, 9, 1, 1.0, 60, 0.8);
  return unit(TEAMS.ENEMY,'EG', 16, 16, 5, 1, 1.0, 70, 0.9);
}
function unit(team, kind, hp, max, atk, rng, cd, speed, acc){
  return {team, kind, x:0,y:0, vx:0,vy:0, hp, max, atk, rng, cd, tAtk:0, speed, acc};
}

// ------- Enemies & waves -------
function spawnWave(n){
  // simple ramp: more goblins + slingers; brutes every 3 waves
  let g = 3 + Math.floor(n*1.2);
  let s = Math.floor(n/2);
  let b = Math.floor((n-1)/3);
  for(let i=0;i<g;i++) spawnEnemy('Goblin');
  for(let i=0;i<s;i++) spawnEnemy('Slinger');
  for(let i=0;i<b;i++) spawnEnemy('Brute');
}
function spawnEnemy(kind){
  const u = baseUnit(kind);
  u.x = W*0.55 + Math.random()*W*0.35;
  u.y = H*0.2 + Math.random()*H*0.6 - 40;
  game.units.push(u);
}

// ------- AOE spell -------
function aoe(yCenter, radius, dmg, stun){
  fxRing(W*0.6, yCenter, radius);
  game.units.forEach(u=>{
    if (u.team===TEAMS.ENEMY){
      const dx = u.x - W*0.6;
      const dy = u.y - yCenter;
      const d2 = Math.hypot(dx,dy);
      if (d2 <= radius){
        u.hp -= dmg;
        u.tAtk = Math.max(u.tAtk, stun||0);
        fxHit(u.x,u.y);
      }
    }
  });
}

// ------- FX helpers -------
function fxHit(x,y){ game.fx.push({x,y,t:0.15,type:'hit'}); }
function fxRing(x,y,r){ game.fx.push({x,y,t:0.4, r, type:'ring'}); }
function fxText(x,y,txt){ game.fx.push({x,y,t:0.9, text:txt, type:'text', yo:0}); }

// ------- Update / AI -------
function nearest(u, teamFilter){
  let best=null, bd=1e9;
  for(const v of game.units){
    if (v.team!==teamFilter || v.hp<=0) continue;
    const d = Math.abs(v.x-u.x)+Math.abs(v.y-u.y);
    if (d<bd){bd=d; best=v;}
  }
  return best;
}

function step(dt){
  if (!running) return;

  // spawn enemies over time at start of wave
  game.spawnCD -= dt;
  if (game.spawnCD <= 0 && enemiesAlive()==0){
    spawnWave(game.wave);
    game.spawnCD = 1e9; // disable until next wave scheduled
  }

  if (game.volleyT>0) game.volleyT = Math.max(0, game.volleyT - dt);

  // Unit AI
  for(const u of game.units){
    if (u.hp<=0) continue;
    if (u.team===TEAMS.ALLY){
      const e = nearest(u, TEAMS.ENEMY);
      if (!e) continue;
      const dx = e.x - u.x, dy = e.y - u.y;
      const dist = Math.hypot(dx,dy);

      // attack?
      u.tAtk -= dt;
      const rngPx = u.rng * cellW * 0.9;
      if (dist <= rngPx && u.tAtk<=0){
        if (u.rng>1){
          shoot(u, e, (game.volleyT>0 && u.kind==='AR')? u.atk*1.8 : u.atk);
        }else{
          e.hp -= u.atk; fxHit(e.x,e.y);
        }
        u.tAtk = u.cd;
      }else{
        // move closer
        const sp = u.speed * dt;
        u.x += sp * Math.sign(dx);
        u.y += sp * Math.sign(dy);
      }
    }else{ // enemies
      // approach necro baseline (defended by allies)
      const a = nearest(u, TEAMS.ALLY);
      const tx = a? a.x : W*0.25;
      const ty = a? a.y : H*0.75;
      const dx = tx - u.x, dy = ty - u.y;
      const dist = Math.hypot(dx,dy);
      u.tAtk -= dt;
      const rngPx = u.rng * cellW * 0.9;
      if (dist <= rngPx && u.tAtk<=0){
        if (a){
          if (u.rng>1) shoot(u, a, u.atk);
          else { a.hp -= u.atk; fxHit(a.x,a.y); }
        }else{
          // hit the necromancer line
          game.necroHP -= u.atk;
          fxText(W*0.25, H*0.85, '-'+u.atk);
        }
        u.tAtk = u.cd;
      }else{
        const sp = u.speed * dt;
        u.x += sp * Math.sign(dx);
        u.y += sp * Math.sign(dy);
      }
    }
  }

  // projectiles
  for(const p of game.proj){
    p.x += p.vx*dt; p.y += p.vy*dt; p.life -= dt;
    if (p.life<=0) p.dead = true;
    const tgt = nearestPointTarget(p);
    if (tgt && Math.hypot(tgt.x-p.x,tgt.y-p.y) < 10){
      tgt.hp -= p.dmg; fxHit(tgt.x,tgt.y); p.dead = true;
    }
  }
  game.proj = game.proj.filter(p=>!p.dead);

  // cleanup dead
  for(const u of game.units){
    if (u.hp<=0){ u.dead = true; }
  }
  game.units = game.units.filter(u=>!u.dead);

  // win/lose check
  if (enemiesAlive()==0 && game.spawnCD>1e8){
    // wave cleared
    game.souls += 2 + Math.floor(game.wave/3);
    game.wave++;
    game.spawnCD = 1.0; // start next wave in 1s
    fxText(W*0.5, 40, `WAVE ${game.wave-1} CLEAR!`);
    soulsEl.textContent = `Souls ${game.souls}`;
    waveEl.textContent = `Wave ${game.wave}`;
    // reward: inject 1–2 bonus blocks
    if (Math.random()<0.7){ blocks.unshift('SK'); }
    if (Math.random()<0.4){ blocks.unshift('AR'); }
    while(blocks.length>BAR_SIZE) blocks.pop();
    renderBar();
  }
  if (game.necroHP<=0){
    running=false;
    fxText(W*0.5, H*0.5, 'DEFEAT');
  }

  // HUD
  hpEl.textContent = `HP ${Math.max(0,game.necroHP)}`;
}

// projectile helpers
function shoot(u, target, dmg){
  const ang = Math.atan2(target.y-u.y, target.x-u.x);
  game.proj.push({x:u.x, y:u.y, vx:280*Math.cos(ang), vy:280*Math.sin(ang), dmg, team:u.team, life:1.5});
}
function nearestPointTarget(p){
  let best=null, bd=1e9;
  for(const u of game.units){
    if (u.hp<=0) continue;
    if (p.team===TEAMS.ALLY && u.team!==TEAMS.ENEMY) continue;
    if (p.team===TEAMS.ENEMY && u.team!==TEAMS.ALLY) continue;
    const d = Math.abs(u.x-p.x)+Math.abs(u.y-p.y);
    if (d<bd){bd=d; best=u;}
  }
  return best;
}
function enemiesAlive(){ return game.units.some(u=>u.team===TEAMS.ENEMY && u.hp>0); }

// ------- Render -------
function draw(){
  ctx.clearRect(0,0,W,H);
  // grid
  ctx.strokeStyle = '#1e1e24';
  ctx.lineWidth = 1;
  for(let c=1;c<COLS;c++){ ctx.beginPath(); ctx.moveTo(c*cellW,0); ctx.lineTo(c*cellW,H); ctx.stroke(); }
  for(let r=1;r<ROWS;r++){ ctx.beginPath(); ctx.moveTo(0,r*cellH); ctx.lineTo(W,r*cellH); ctx.stroke(); }

  // necro baseline
  ctx.fillStyle = '#24242c';
  ctx.fillRect(0,H*0.82,W*0.5,4);

  // units
  for(const u of game.units){
    const isAlly = u.team===TEAMS.ALLY;
    ctx.fillStyle = isAlly ? '#5ed892' : '#e06a6a';
    if (u.kind==='AR') ctx.fillStyle = '#7ed0ff';
    if (u.kind==='WR'||u.kind==='WE') ctx.fillStyle = '#b69aff';
    if (u.kind==='BK') ctx.fillStyle = '#e0c078';
    ctx.fillRect(u.x-10,u.y-10,20,20);
    // hp bar
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(u.x-12,u.y+12,24,4);
    ctx.fillStyle = '#7cf470';
    ctx.fillRect(u.x-12,u.y+12, 24*(u.hp/u.max),4);
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
      ctx.strokeRect(f.x-12,f.y-12,24,24);
    }else if(f.type==='ring'){
      ctx.strokeStyle = '#ffdd77aa';
      ctx.beginPath(); ctx.arc(f.x,f.y, f.r*(1-f.t/0.4), 0, Math.PI*2); ctx.stroke();
    }else if(f.type==='text'){
      f.yo -= 0.6;
      ctx.fillStyle = '#ffd45a';
      ctx.font = 'bold 18px system-ui';
      ctx.textAlign='center';
      ctx.fillText(f.text, f.x, f.y + f.yo);
    }
  }
  game.fx = game.fx.filter(f=>f.t>0);
}

// ------- Loop -------
function loop(now){
  const dt = Math.min((now-last)/1000, dtCap); last = now; t += dt;
  step(dt);
  draw();
  requestAnimationFrame(loop);
}

// ------- UI -------
btnPause.onclick = ()=>{
  running = !running;
  btnPause.textContent = running?'⏸':'▶️';
};

// boot
refillBlocks();
game.spawnCD = 0.4; // kickoff first wave quickly
requestAnimationFrame(loop);
