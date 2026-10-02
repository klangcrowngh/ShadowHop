// Тап — вперёд, свайп — в сторону свайпа, стрелки/WASD на клавиатуре.
// Свайп срабатывает сразу при превышении порога, не дожидаясь отпускания.
const SWIPE = 22;

export function bindInput(target, onMove) {
  let start = null;

  target.addEventListener('pointerdown', (e) => {
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });

  target.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) < SWIPE) return;
    start = null;
    if (Math.abs(dx) > Math.abs(dy)) onMove(dx > 0 ? 'right' : 'left');
    else onMove(dy < 0 ? 'up' : 'down');
  });

  target.addEventListener('pointerup', (e) => {
    if (!start || e.pointerId !== start.id) return;
    start = null;
    onMove('up');
  });

  target.addEventListener('pointercancel', () => { start = null; });

  const KEYS = {
    ArrowUp: 'up', KeyW: 'up', Space: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
  };
  window.addEventListener('keydown', (e) => {
    const dir = KEYS[e.code];
    if (!dir || e.repeat) return;
    e.preventDefault();
    onMove(dir);
  });
}
