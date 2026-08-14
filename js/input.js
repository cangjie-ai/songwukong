'use strict';
// ============ 键盘输入 ============
const Input = {
  down: Object.create(null),
  pressed: Object.create(null),
  anyKey: false,
  init() {
    window.addEventListener('keydown', e => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      Input.down[e.code] = true;
      Input.pressed[e.code] = true;
      Input.anyKey = true;
      SFX.init(); // 首次按键解锁音频
    });
    window.addEventListener('keyup', e => { Input.down[e.code] = false; });
    window.addEventListener('blur', () => { Input.down = Object.create(null); });
  },
  isDown(...codes) { return codes.some(c => this.down[c]); },
  wasPressed(...codes) { return codes.some(c => this.pressed[c]); },
  endFrame() { this.pressed = Object.create(null); this.anyKey = false; }
};
