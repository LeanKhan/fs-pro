import type { MatchHighlight } from '@repo/api-contract';

type Team = { name: string; colors: [string, string] };
type Kind = 'goal' | 'save' | 'miss' | 'card' | 'kickoff' | 'half' | 'full' | 'other';
interface MatchEvent { minute: number; side: 0 | 1; kind: Kind; text: string }

const KINDS: Record<string, Kind> = { goal: 'goal', save: 'save', shot: 'miss', foul: 'card' };

/** The server's highlights (side 'you' = home), framed by kick-off, half-time and full-time. */
function timeline(highlights: MatchHighlight[], score: [number, number]): MatchEvent[] {
  const evs: MatchEvent[] = highlights.map((h) => ({
    minute: h.minute, side: h.side === 'you' ? 0 : 1, kind: KINDS[h.type] ?? 'other', text: h.message,
  }));
  evs.push(
    { minute: 0, side: 0, kind: 'kickoff', text: 'Kick-off!' },
    { minute: 45, side: 0, kind: 'half', text: 'Half-time.' },
    { minute: 90, side: 0, kind: 'full', text: `Full-time: ${score[0]} - ${score[1]}.` },
  );
  return evs.sort((a, b) => a.minute - b.minute);
}

const FORMATION_442: [number, number][] = [
  [0.05, 0.5], [0.2, 0.15], [0.2, 0.38], [0.2, 0.62], [0.2, 0.85],
  [0.38, 0.15], [0.38, 0.38], [0.38, 0.62], [0.38, 0.85], [0.47, 0.4], [0.47, 0.6],
];

/** Plays a match back over ~30 seconds. Resolves when the viewer closes it or it ends. */
export function showMatch(m: { home: Team; away: Team; highlights: MatchHighlight[]; score: [number, number] }, root: HTMLElement): Promise<void> {
  const events = timeline(m.highlights, m.score);
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'match-screen';
    el.innerHTML = `
      <div class="match-top">
        <div class="team"><span class="kit" style="--a:${m.home.colors[0]};--b:${m.home.colors[1]}"></span>${esc(m.home.name)}</div>
        <div class="score"><b id="ms-score">0 - 0</b><small id="ms-min">0'</small></div>
        <div class="team right">${esc(m.away.name)}<span class="kit" style="--a:${m.away.colors[0]};--b:${m.away.colors[1]}"></span></div>
      </div>
      <div class="match-pitch"><canvas></canvas><div class="goal-flash" id="ms-flash">GOAL!</div></div>
      <ul class="match-feed" id="ms-feed"></ul>
      <div class="match-actions">
        <button class="btn" data-speed>Speed x2</button>
        <button class="btn primary" data-skip>Skip to result</button>
      </div>`;
    root.appendChild(el);
    const canvas = el.querySelector('canvas')!;
    const ctx = canvas.getContext('2d')!;
    const feed = el.querySelector('#ms-feed')!;
    const scoreEl = el.querySelector('#ms-score')!;
    const minEl = el.querySelector('#ms-min')!;
    const flash = el.querySelector('#ms-flash') as HTMLElement;

    let speed = 1;
    const MATCH_SECONDS = 30;
    let minute = 0;
    let shown = 0;
    const score = [0, 0];
    let last = performance.now();
    let done = false;
    // Ball state: moves between players; on events, it goes to goal.
    const ball = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    let possession: 0 | 1 = 0;
    let passTimer = 0;
    let flashT = 0;

    const fit = () => {
      const r = canvas.parentElement!.getBoundingClientRect();
      canvas.width = r.width * devicePixelRatio;
      canvas.height = r.height * devicePixelRatio;
    };
    fit();
    window.addEventListener('resize', fit);

    const players = (side: 0 | 1) =>
      FORMATION_442.map(([fx, fy], i) => {
        const bx = side === 0 ? fx : 1 - fx;
        const pull = i === 0 ? 0.04 : 0.22;
        const push = possession === side ? (side === 0 ? 0.08 : -0.08) : 0;
        const wob = Math.sin(performance.now() / 600 + i * 1.7 + side) * 0.012;
        return { x: bx + (ball.x - bx) * pull + push + wob, y: fy + (ball.y - fy) * pull * 0.8 + wob };
      });

    const push = (e: MatchEvent) => {
      const li = document.createElement('li');
      li.className = `ev ev-${e.kind} side${e.side}`;
      const tag = e.kind === 'goal' ? '⚽' : e.kind === 'card' ? '🟨' : e.kind === 'save' ? '🧤' : e.kind === 'miss' ? '💨' : '📣';
      li.innerHTML = `<span class="min">${e.minute}'</span><span class="tag">${tag}</span><span>${esc(e.text)}</span>`;
      feed.prepend(li);
      if (e.kind === 'goal') {
        score[e.side]++;
        scoreEl.textContent = `${score[0]} - ${score[1]}`;
        flash.style.setProperty('--c', (e.side === 0 ? m.home : m.away).colors[0]);
        flashT = 1.4;
        ball.tx = e.side === 0 ? 1.0 : 0.0;
        ball.ty = 0.5;
      } else if (e.kind === 'save' || e.kind === 'miss') {
        ball.tx = e.side === 0 ? 0.95 : 0.05;
        ball.ty = e.kind === 'miss' ? (Math.random() < 0.5 ? 0.3 : 0.7) : 0.5;
      } else if (e.kind === 'kickoff' || e.kind === 'full' || e.kind === 'half') {
        ball.tx = ball.ty = 0.5;
      }
      if (e.kind !== 'card') possession = e.side === 0 ? 1 : 0;
    };

    const finish = () => {
      if (done) return;
      done = true;
      while (shown < events.length) push(events[shown++]);
      minEl.textContent = "FT";
      setTimeout(() => {
        window.removeEventListener('resize', fit);
        el.remove();
        resolve();
      }, 900);
    };

    el.querySelector('[data-skip]')!.addEventListener('click', finish);
    el.querySelector('[data-speed]')!.addEventListener('click', (ev) => {
      speed = speed === 1 ? 2 : speed === 2 ? 4 : 1;
      (ev.target as HTMLElement).textContent = `Speed x${speed === 4 ? 1 : speed * 2}`;
    });

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      const pad = 18 * devicePixelRatio;
      const pw = W - pad * 2, ph = H - pad * 2;
      const X = (x: number) => pad + x * pw, Y = (y: number) => pad + y * ph;
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = i % 2 ? '#5bb045' : '#53a63e';
        ctx.fillRect((W / 12) * i, 0, W / 12 + 1, H);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2.5 * devicePixelRatio;
      ctx.strokeRect(pad, pad, pw, ph);
      ctx.beginPath();
      ctx.moveTo(W / 2, pad);
      ctx.lineTo(W / 2, H - pad);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, ph * 0.15, 0, Math.PI * 2);
      ctx.stroke();
      for (const s of [0, 1]) {
        const bx = s ? X(1) - pw * 0.13 : X(0);
        ctx.strokeRect(bx, Y(0.25), pw * 0.13, ph * 0.5);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(s ? X(1) : X(0) - 6 * devicePixelRatio, Y(0.42), 6 * devicePixelRatio, ph * 0.16);
      }
      const r = Math.max(6, ph * 0.03);
      for (const side of [0, 1] as const) {
        const team = side === 0 ? m.home : m.away;
        players(side).forEach((p, i) => {
          ctx.beginPath();
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.ellipse(X(p.x), Y(p.y) + r * 0.8, r, r * 0.45, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.fillStyle = i === 0 ? '#3aa655' : team.colors[0];
          ctx.strokeStyle = team.colors[1];
          ctx.lineWidth = 2.5 * devicePixelRatio;
          ctx.arc(X(p.x), Y(p.y), r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }
      ctx.beginPath();
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 1.5 * devicePixelRatio;
      ctx.arc(X(ball.x), Y(ball.y), r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };

    const tick = (now: number) => {
      if (!el.isConnected) return;
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      if (!done) {
        minute += (dt * speed * 90) / MATCH_SECONDS;
        minEl.textContent = `${Math.min(90, Math.floor(minute))}'`;
        while (shown < events.length && events[shown].minute <= minute) push(events[shown++]);
        if (minute >= 91) finish();
        passTimer -= dt * speed;
        if (passTimer <= 0) {
          passTimer = 0.5 + Math.random() * 0.6;
          const mates = players(possession);
          // Play drifts towards the opponent's goal, with the odd turnover.
          const forward = mates.filter((p) => (possession === 0 ? p.x >= ball.x - 0.12 : p.x <= ball.x + 0.12));
          const t = (forward.length ? forward : mates)[Math.floor(Math.random() * (forward.length || mates.length))];
          ball.tx = t.x;
          ball.ty = t.y;
          if (Math.random() < 0.2) possession = possession === 0 ? 1 : 0;
        }
      }
      ball.x += (ball.tx - ball.x) * Math.min(1, dt * 6 * speed);
      ball.y += (ball.ty - ball.y) * Math.min(1, dt * 6 * speed);
      flashT = Math.max(0, flashT - dt);
      flash.style.opacity = String(Math.min(1, flashT * 2));
      flash.style.transform = `translate(-50%,-50%) scale(${1 + (1.4 - flashT) * 0.2})`;
      draw();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
