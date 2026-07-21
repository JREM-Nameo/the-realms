export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function random2D(x, y) {
    const n = x * 28 + y * 24;
    const s = Math.sin(n) * 43758.5453123;
    return s - Math.floor(s);
}

export function valueNoise(x, y, scale) {

    const gridX = Math.floor(x / scale);
    const gridY = Math.floor(y / scale);

    const localX = (x % scale) / scale;
    const localY = (y % scale) / scale;

    const topLeft = random2D(gridX, gridY);
    const topRight = random2D(gridX + 1, gridY);

    const bottomLeft = random2D(gridX, gridY + 1);
    const bottomRight = random2D(gridX + 1, gridY + 1);

    const top = lerp(topLeft, topRight, localX);
    const bottom = lerp(bottomLeft, bottomRight, localX);

    return lerp(top, bottom, localY);

}

export function fractalNoise(x, y) {

    let value = 0;
    let amplitude = 1;
    let frequency = 1;

    let maxValue = 0;

    for (let i = 0; i < 5; i++) {

        value += valueNoise(
            x * frequency,
            y * frequency,
            64
        ) * amplitude;

        maxValue += amplitude;

        amplitude *= 0.5;
        frequency *= 2;

    }

    return value / maxValue;

}