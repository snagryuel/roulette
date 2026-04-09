export class Item {
  x: number;
  y: number;
  readonly size: number = 0.15;
  isCollected: boolean = false;
  private _pulse: number = 0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this._pulse = Math.random() * Math.PI * 2;
  }

  update(deltaTime: number) {
    this._pulse = (this._pulse + deltaTime * 0.004) % (Math.PI * 2);
  }

  render(ctx: CanvasRenderingContext2D, zoom: number) {
    if (this.isCollected) return;
    const r = this.size + Math.sin(this._pulse) * 0.025;

    ctx.save();
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 8 / zoom;
    ctx.fillStyle = '#ffd700';
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 0.025;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
