import { TAU, rand, clamp, dist2, DANGER_HUE } from './util.js';
import { UPGRADES } from './upgrades.js';
import { CLASSES, DEFAULT_CLASS, BASE, classStats } from './classes.js';
import * as D from './difficulty.js';

const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const W = cv.width, H = cv.height;

// ---- input ----
const keys = {};
addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase())) e.preventDefault();
  if (e.key.toLowerCase()==='p') game.paused = !game.paused;
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// ---- game state ----
const game = {
  state: 'title', // title | classSelect | playing | upgrade | dead
  wave: 0, score: 0, paused:false,
  player: null, enemies: [], pBullets: [], eBullets: [], particles: [],
  upgrades: [], upgradeChoices: [], time: 0,
  cls: DEFAULT_CLASS, classIdx: 0,
};

function newPlayer(cls=DEFAULT_CLASS) {
  const p = {
    x: W/2, y: H*0.75, r: 12, hitR: 4,
    hp: BASE.maxhp, maxhp: BASE.maxhp, speed: BASE.speed, focusSpeed: BASE.focusSpeed,
    lvl: 1, xp: 0, xpNext: 8,
    fireRate: BASE.fireRate, fireCd: 0, dmg: BASE.dmg, bulletSpeed: BASE.bulletSpeed, shots: 1, spread: 0,
    pierce: 0, crit: 0.05, life: 0, iframes: 0,
    cls, weapon: cls.weapon||'bullet', range: cls.range||0,
    active: cls.active||null, activeCd: 0,
  };
  if (cls.stats) Object.assign(p, cls.stats); // class profile overrides base
  return p;
}

function rollUpgrades() {
  const pool = UPGRADES.slice();
  const out = [];
  for (let i=0;i<3 && pool.length;i++) out.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);
  game.upgradeChoices = out;
}

// ---- spawning ----
function startWave(n) {
  game.wave = n;
  const count = D.enemyCount(n);
  for (let i=0;i<count;i++) {
    const boss = (n%5===0) && i===0;
    game.enemies.push(makeEnemy(boss ? D.bossHp(n) : D.enemyHp(n), n, boss));
  }
}

function makeEnemy(hp, wave, boss) {
  const x = rand(60, W-60), y = rand(-140,-40);
  const patterns = ['aimed','spread','spiral','ring'];
  return {
    x, y, r: boss?34:16, hp, maxhp:hp, boss,
    vx: rand(-0.6,0.6), vy: rand(0.5,1.1),
    targetY: boss? rand(90,150) : rand(60, H*0.42),
    fireCd: rand(30,90), pattern: boss?'spiral': patterns[Math.floor(rand(0,patterns.length))],
    ang: 0, wave, hue: boss?350:rand(180,320),
  };
}

// ---- shooting ----
function playerShoot(p) {
  const target = nearestEnemy(p.x,p.y);
  let baseAng = -Math.PI/2;
  if (target) baseAng = Math.atan2(target.y-p.y, target.x-p.x);
  const n = p.shots;
  for (let i=0;i<n;i++) {
    const off = (i-(n-1)/2)*p.spread;
    const a = baseAng+off;
    const crit = Math.random() < p.crit;
    game.pBullets.push({ x:p.x, y:p.y, vx:Math.cos(a)*p.bulletSpeed, vy:Math.sin(a)*p.bulletSpeed,
      r:crit?6:4, dmg:p.dmg*(crit?2:1), crit, pierce:p.pierce,
      ttl: p.range ? Math.ceil(p.range/p.bulletSpeed) : 0 });
  }
}

function enemyShoot(e) {
  const p = game.player;
  const aim = Math.atan2(p.y-e.y, p.x-e.x);
  const spd = D.bulletSpeed(game.wave);
  const push = (a,s=spd) => game.eBullets.push({ x:e.x, y:e.y, vx:Math.cos(a)*s, vy:Math.sin(a)*s, r:5, hue:e.hue });
  switch(e.pattern) {
    case 'aimed': {
      push(aim);
      const flank = e.boss ? 1 : D.aimedExtra(game.wave);
      for(let i=1;i<=flank;i++){ push(aim - i*0.15); push(aim + i*0.15); }
      break;
    }
    case 'spread': { const k=D.spreadCount(game.wave), half=(k-1)/2;
      for(let i=-half;i<=half;i++) push(aim+i*0.18); break; }
    case 'ring': { const k=D.ringCount(game.wave, e.boss); for(let i=0;i<k;i++) push(i/k*TAU); break; }
    case 'spiral': { const arms=e.boss?4:2; for(let a=0;a<arms;a++) push(e.ang + a/arms*TAU); e.ang+=0.4; break; }
  }
}

function nearestEnemy(x,y) {
  let best=null, bd=Infinity;
  for (const e of game.enemies){ const d=dist2(x,y,e.x,e.y); if(d<bd){bd=d;best=e;} }
  return best;
}

// ---- particles ----
function burst(x,y,hue,n=10,sp=3){ for(let i=0;i<n;i++){ const a=rand(0,TAU),s=rand(0.5,sp);
  game.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(14,30),hue}); } }
function animateParticles(){ for(let i=game.particles.length-1;i>=0;i--){ const pt=game.particles[i];
  pt.x+=pt.vx;pt.y+=pt.vy;pt.vx*=0.94;pt.vy*=0.94;pt.life--;
  if(pt.life<=0)game.particles.splice(i,1); } }

// ---- flow ----
function reset(cls=game.cls){ game.cls=cls; game.paused=false;
  game.enemies=[];game.pBullets=[];game.eBullets=[];game.particles=[];game.upgrades=[];
  game.score=0;game.wave=0;game.player=newPlayer(cls);game.state='playing';startWave(1); }

// active-ability framework: trigger key fires the class's active if off cooldown.
function useActive(p){ if(!p||!p.active||p.activeCd>0) return;
  p.active.trigger(game,p); p.activeCd=p.active.cooldown; }

// abandon the current run and return to the title screen (pause-menu quit, #27).
function quitRun(){ game.paused=false; game.state='title'; game.player=null;
  game.enemies=[];game.pBullets=[];game.eBullets=[];game.particles=[]; }

function gainXp(p, amt){
  p.xp+=amt;
  while(p.xp>=p.xpNext){ p.xp-=p.xpNext; p.lvl++; p.xpNext=Math.floor(p.xpNext*1.35+3);
    rollUpgrades(); game.state='upgrade'; }
}

function pickUpgrade(i){
  const u=game.upgradeChoices[i]; if(!u)return;
  u.apply(game.player); game.upgrades.push(u.id);
  if(game.state==='upgrade') game.state='playing';
}

addEventListener('keydown', e=>{
  const k=e.key.toLowerCase();
  if(game.paused && k==='q'){ quitRun(); return; } // quit-to-title from pause menu
  if(game.state==='upgrade'){ const n=parseInt(e.key); if(n>=1&&n<=3) pickUpgrade(n-1); }
  if((game.state==='title'||game.state==='dead') && (k===' '||k==='enter')){ game.classIdx=CLASSES.indexOf(game.cls); if(game.classIdx<0)game.classIdx=0; game.state='classSelect'; return; }
  if(game.state==='classSelect'){
    if(k==='arrowleft'||k==='a') game.classIdx=(game.classIdx+CLASSES.length-1)%CLASSES.length;
    else if(k==='arrowright'||k==='d') game.classIdx=(game.classIdx+1)%CLASSES.length;
    else if(k===' '||k==='enter') reset(CLASSES[game.classIdx]);
    else { const n=parseInt(e.key); if(n>=1&&n<=CLASSES.length) reset(CLASSES[n-1]); }
    return;
  }
  if(game.state==='playing' && k===' ') useActive(game.player);
});
cv.addEventListener('pointerdown', e=>{
  const rect=cv.getBoundingClientRect();
  const mx=(e.clientX-rect.left)*(W/rect.width), my=(e.clientY-rect.top)*(H/rect.height);
  if(game.state==='title'||game.state==='dead'){ game.classIdx=CLASSES.indexOf(game.cls); if(game.classIdx<0)game.classIdx=0; game.state='classSelect'; return; }
  if(game.state==='classSelect'){
    for(let i=0;i<CLASSES.length;i++){ const c=classCardRect(i);
      if(mx>=c.x&&mx<=c.x+c.w&&my>=c.y&&my<=c.y+c.h){ reset(CLASSES[i]); return; } }
    return;
  }
  if(game.state==='upgrade'){
    const idx=Math.floor((my-220)/150); if(idx>=0&&idx<3) pickUpgrade(idx);
  }
});

// ---- update ----
function update(){
  game.time++;
  const p = game.player;
  if(!p) return;
  if(p.iframes>0) p.iframes--;
  if(p.activeCd>0) p.activeCd--;

  // movement
  const focus = keys['shift'];
  const sp = focus? p.focusSpeed : p.speed;
  let dx=0,dy=0;
  if(keys['a']||keys['arrowleft'])dx--; if(keys['d']||keys['arrowright'])dx++;
  if(keys['w']||keys['arrowup'])dy--; if(keys['s']||keys['arrowdown'])dy++;
  if(dx&&dy){dx*=0.707;dy*=0.707;}
  p.x=clamp(p.x+dx*sp,p.r,W-p.r); p.y=clamp(p.y+dy*sp,p.r,H-p.r);
  const hitR = focus? p.hitR : p.hitR+3;

  // fire
  p.fireCd--; if(p.fireCd<=0 && game.enemies.length){ playerShoot(p); p.fireCd=p.fireRate; }

  // player bullets
  for(let i=game.pBullets.length-1;i>=0;i--){ const b=game.pBullets[i];
    b.x+=b.vx;b.y+=b.vy;
    if(b.ttl && --b.ttl<=0){ burst(b.x,b.y,190,3,1.4); game.pBullets.splice(i,1); continue; } // short-range fizzle
    if(b.x<-20||b.x>W+20||b.y<-20||b.y>H+20){game.pBullets.splice(i,1);continue;}
    for(const e of game.enemies){ if(dist2(b.x,b.y,e.x,e.y)<(e.r+b.r)**2){
      e.hp-=b.dmg; burst(b.x,b.y,b.crit?45:280,b.crit?8:4,2);
      if(b.pierce>0){b.pierce--;} else {game.pBullets.splice(i,1);}
      break;
    }}
  }

  // enemies
  for(let i=game.enemies.length-1;i>=0;i--){ const e=game.enemies[i];
    if(e.y<e.targetY){ e.y+=e.vy; } else { e.x+=e.vx; e.y+=Math.sin(game.time*0.02+i)*0.4;
      if(e.x<40||e.x>W-40)e.vx*=-1; }
    e.fireCd--; if(e.fireCd<=0 && e.y>0){ enemyShoot(e); e.fireCd = D.fireCooldown(game.wave, e.boss); }
    if(e.hp<=0){ burst(e.x,e.y,e.hue,e.boss?40:16,e.boss?6:4); game.enemies.splice(i,1);
      game.score += e.boss?500:50; if(p.leech)p.hp=Math.min(p.maxhp,p.hp+p.leech);
      gainXp(p, e.boss?6:2); }
  }

  // enemy bullets
  for(let i=game.eBullets.length-1;i>=0;i--){ const b=game.eBullets[i];
    b.x+=b.vx;b.y+=b.vy;
    if(b.x<-20||b.x>W+20||b.y<-20||b.y>H+20){game.eBullets.splice(i,1);continue;}
    if(p.iframes<=0 && dist2(b.x,b.y,p.x,p.y)<(hitR+b.r)**2){
      p.hp-=8; p.iframes=p.iframeMax||40; burst(p.x,p.y,DANGER_HUE,20,4);
      game.eBullets.splice(i,1);
      if(p.hp<=0){ game.state='dead'; }
    }
  }

  // particles
  animateParticles();

  // wave clear
  if(game.enemies.length===0 && game.state==='playing'){ startWave(game.wave+1); game.score+=100; }

  // hud
  document.getElementById('h-wave').textContent=game.wave;
  document.getElementById('h-hp').textContent=Math.max(0,Math.ceil(p.hp));
  document.getElementById('h-lvl').textContent=p.lvl;
  document.getElementById('h-score').textContent=game.score;
}

// ---- render ----
function draw(){
  ctx.clearRect(0,0,W,H);
  // starfield backdrop
  ctx.fillStyle='#06060b'; ctx.fillRect(0,0,W,H);
  ctx.globalAlpha=0.5;
  for(let i=0;i<40;i++){ const y=((i*97 + game.time*(1+i%3))%H); ctx.fillStyle=i%3?'#191933':'#12122a';
    ctx.fillRect((i*53)%W, y, 2, 2); }
  ctx.globalAlpha=1;

  if(game.state==='title'){ center('VOIDWAKE', 54, '#e8e8f0', H/2-40);
    center('a roguelike bullet hell', 18, '#8a5cff', H/2+6);
    center('press SPACE / click to choose a vessel', 15, '#7a7a98', H/2+50); frameFooter(); return; }

  if(game.state==='classSelect'){ drawClassSelect(); return; }

  // particles
  for(const pt of game.particles){ ctx.globalAlpha=clamp(pt.life/24,0,1);
    ctx.fillStyle=`hsl(${pt.hue},90%,65%)`; ctx.fillRect(pt.x-1.5,pt.y-1.5,3,3); }
  ctx.globalAlpha=1;

  // player bullets
  for(const b of game.pBullets){ ctx.fillStyle=b.crit?'#ffd24d':'#7cf7ff';
    ctx.shadowBlur=8; ctx.shadowColor=ctx.fillStyle;
    ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,TAU);ctx.fill(); }
  ctx.shadowBlur=0;

  // enemies
  for(const e of game.enemies){ const c=`hsl(${e.hue},70%,${e.boss?60:55}%)`;
    ctx.fillStyle=c; ctx.strokeStyle='#000'; ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(e.x,e.y,e.r,0,TAU);ctx.fill();ctx.stroke();
    // hp bar
    const w=e.r*2, h=e.boss?5:3; ctx.fillStyle='#000'; ctx.fillRect(e.x-w/2,e.y-e.r-8,w,h);
    ctx.fillStyle=c; ctx.fillRect(e.x-w/2,e.y-e.r-8,w*clamp(e.hp/e.maxhp,0,1),h); }

  // enemy bullets
  for(const b of game.eBullets){ ctx.fillStyle=`hsl(${b.hue},95%,68%)`;
    ctx.shadowBlur=6; ctx.shadowColor=ctx.fillStyle;
    ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,TAU);ctx.fill(); }
  ctx.shadowBlur=0;

  // player
  const p=game.player;
  if(p){
    const blink = p.iframes>0 && (game.time>>2)%2;
    if(!blink){
      const pc=`hsl(${(p.cls&&p.cls.hue)||265},70%,62%)`;
      ctx.fillStyle=pc; ctx.shadowBlur=14; ctx.shadowColor=pc;
      ctx.beginPath();
      ctx.moveTo(p.x,p.y-p.r); ctx.lineTo(p.x-p.r*0.8,p.y+p.r*0.7);
      ctx.lineTo(p.x,p.y+p.r*0.3); ctx.lineTo(p.x+p.r*0.8,p.y+p.r*0.7); ctx.closePath(); ctx.fill();
      ctx.shadowBlur=0;
    }
    // hitbox dot when focusing
    if(keys['shift']){ ctx.fillStyle='#fff'; ctx.beginPath();ctx.arc(p.x,p.y,p.hitR,0,TAU);ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.3)';ctx.beginPath();ctx.arc(p.x,p.y,p.r+6,0,TAU);ctx.stroke(); }
    // active-ability indicator (only if this class has one)
    if(p.active && (game.state==='playing'||game.state==='upgrade')){
      const ready=p.activeCd<=0;
      ctx.textAlign='center'; ctx.font='bold 13px ui-monospace,monospace';
      ctx.fillStyle=ready?'#7cf7ff':'#565879';
      ctx.fillText('[SPACE] '+p.active.name+(ready?'  READY':'  '+Math.ceil(p.activeCd/60)+'s'), W/2, H-22);
      ctx.textAlign='left';
    }
  }

  if(game.state==='upgrade') drawUpgrade();
  if(game.state==='dead'){ ctx.fillStyle='rgba(6,6,11,.78)'; ctx.fillRect(0,0,W,H);
    center('YOU DIED', 52, '#ff4d6d', H/2-50);
    center('reached wave '+game.wave+'  ·  score '+game.score, 18, '#e8e8f0', H/2+4);
    center('press SPACE / click to try again', 15, '#7a7a98', H/2+46); }

  if(game.paused){ ctx.fillStyle='rgba(6,6,11,.7)';ctx.fillRect(0,0,W,H);
    center('PAUSED',40,'#e8e8f0',H/2-28);
    center('[P] resume',17,'#b4b4d0',H/2+18);
    center('[Q] quit to title',17,'#b4b4d0',H/2+46); }
}

function drawUpgrade(){
  ctx.fillStyle='rgba(6,6,11,.82)'; ctx.fillRect(0,0,W,H);
  center('LEVEL UP', 40, '#8a5cff', 150);
  center('choose a boon  (1 / 2 / 3 or click)', 14, '#7a7a98', 190);
  game.upgradeChoices.forEach((u,i)=>{
    const y=220+i*150, x=W/2-260, w=520, h=120;
    ctx.fillStyle='#14142a'; ctx.strokeStyle='#8a5cff'; ctx.lineWidth=2;
    roundRect(x,y,w,h,10); ctx.fill(); ctx.stroke();
    ctx.textAlign='left';
    ctx.fillStyle='#8a5cff'; ctx.font='bold 22px ui-monospace,monospace';
    ctx.fillText((i+1)+'.  '+u.name, x+24, y+48);
    ctx.fillStyle='#c8c8e0'; ctx.font='16px ui-monospace,monospace';
    ctx.fillText(u.desc, x+50, y+82);
  });
  ctx.textAlign='left';
}

// ---- class select ----
function classCardRect(i){
  const n=CLASSES.length, gap=20, margin=40;
  const cw=Math.min(300,(W-2*margin-(n-1)*gap)/n);
  const tot=n*cw+(n-1)*gap;
  return { x:(W-tot)/2 + i*(cw+gap), y:H/2-150, w:cw, h:300 };
}
function drawClassSelect(){
  ctx.fillStyle='#06060b'; ctx.fillRect(0,0,W,H);
  center('CHOOSE YOUR VESSEL', 34, '#8a5cff', 120);
  center('← → or 1-'+CLASSES.length+' to pick  ·  SPACE / click to descend', 14, '#7a7a98', 158);
  CLASSES.forEach((cls,i)=>{
    const r=classCardRect(i), sel=i===game.classIdx, hue=cls.hue;
    ctx.fillStyle = sel?'#1b1533':'#101022';
    ctx.strokeStyle=`hsl(${hue},70%,60%)`; ctx.lineWidth=sel?3:1.5;
    roundRect(r.x,r.y,r.w,r.h,12); ctx.fill(); ctx.stroke();
    // ship glyph
    const cx=r.x+r.w/2, cy=r.y+62;
    ctx.fillStyle=`hsl(${hue},70%,62%)`; ctx.shadowBlur=sel?18:6; ctx.shadowColor=ctx.fillStyle;
    ctx.beginPath(); ctx.moveTo(cx,cy-16); ctx.lineTo(cx-13,cy+12); ctx.lineTo(cx,cy+5); ctx.lineTo(cx+13,cy+12); ctx.closePath(); ctx.fill();
    ctx.shadowBlur=0;
    // name — centered within THIS card (not the screen)
    ctx.textAlign='center'; ctx.fillStyle='#e8e8f0'; ctx.font='bold 20px ui-monospace,monospace';
    ctx.fillText((i+1)+'. '+cls.name, cx, r.y+112);
    // description — LEFT-aligned inside the card padding
    wrapText(cls.desc, r.x+18, r.y+140, r.w-36, 17, '#b4b4d0', 13);
    // stats — fixed rows, label left / value right; rows align across all cards
    let sy=r.y+180;
    ctx.font='12px ui-monospace,monospace';
    for(const [label,val] of classStats(cls)){
      ctx.textAlign='left';  ctx.fillStyle='#7a7a98'; ctx.fillText(label, r.x+18, sy);
      ctx.textAlign='right'; ctx.fillStyle='#c8c8e0'; ctx.fillText(val, r.x+r.w-18, sy);
      sy+=15;
    }
    ctx.textAlign='left';
  });
  frameFooter();
}
// left-aligned word wrap; x is the left edge.
function wrapText(text,x,y,maxw,lineH,color,size){
  ctx.fillStyle=color; ctx.font=size+'px ui-monospace,monospace'; ctx.textAlign='left';
  const words=text.split(' '); let line='', yy=y;
  for(const w of words){ const test=line?line+' '+w:w;
    if(ctx.measureText(test).width>maxw && line){ ctx.fillText(line,x,yy); line=w; yy+=lineH; }
    else line=test; }
  if(line) ctx.fillText(line,x,yy);
}

function roundRect(x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function center(t,size,color,y){ ctx.textAlign='center'; ctx.fillStyle=color;
  ctx.font=`bold ${size}px ui-monospace,monospace`; ctx.fillText(t,W/2,y); ctx.textAlign='left'; }
function frameFooter(){ center('v0.2', 12, '#3a3a55', H-24); }

// ---- loop ----
// Fixed timestep: sim runs at a constant 60 ticks/sec regardless of the display's
// refresh rate, so the game feels identical on 60/120/144/240Hz panels. (Before this,
// update() ran once per rAF frame with per-frame constants → 2-4x too fast on high-Hz
// displays, and a speed spike whenever the tab/pause backlog fast-forwarded.)
const STEP = 1000/60;   // ms per simulation tick — all tuning constants are per-tick
const MAX_STEPS = 5;    // cap catch-up per frame; prevents post-pause/tab-switch spikes
let acc = 0, last = performance.now();
function tick(){
  if(game.paused) return;
  if(game.state==='playing') update();
  else if(game.state==='upgrade') animateParticles(); // frozen sim, particles still settle
}
function loop(now){
  let frame = now - last; last = now;
  if(frame > 250) frame = STEP;   // tab was hidden / long stall → resume, don't fast-forward
  acc += frame;
  let steps = 0;
  while(acc >= STEP && steps < MAX_STEPS){ tick(); acc -= STEP; steps++; }
  if(steps === MAX_STEPS) acc = 0; // drop leftover backlog instead of spiraling
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
