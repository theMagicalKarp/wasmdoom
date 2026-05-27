export class Vector2 {
  readonly x: number;
  readonly y: number;

  constructor(x: number = 0, y: number = 0) {
    this.x = x;
    this.y = y;
  }

  static zero(): Vector2 {
    return new Vector2(0, 0);
  }

  add(v: Vector2): Vector2 {
    return new Vector2(this.x + v.x, this.y + v.y);
  }

  setX(x: number): Vector2 {
    return new Vector2(x, this.y);
  }

  setY(y: number): Vector2 {
    return new Vector2(this.x, y);
  }

  sub(v: Vector2): Vector2 {
    return new Vector2(this.x - v.x, this.y - v.y);
  }

  equals(v: Vector2): boolean {
    return this.x === v.x && this.y === v.y;
  }

  toString(): string {
    return `(${this.x}, ${this.y})`;
  }
}
