// Keyboard input -> normalized {throttle, steer}. WASD and arrow keys.
export class Input {
  constructor() {
    this.keys = new Set();
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  get throttle() {
    const fwd = this.keys.has('w') || this.keys.has('arrowup');
    const back = this.keys.has('s') || this.keys.has('arrowdown');
    return (fwd ? 1 : 0) - (back ? 1 : 0);
  }

  get steer() {
    const left = this.keys.has('a') || this.keys.has('arrowleft');
    const right = this.keys.has('d') || this.keys.has('arrowright');
    return (right ? 1 : 0) - (left ? 1 : 0);
  }
}
