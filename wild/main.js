import { fractalNoise } from "./noise.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const TILE = 4;

const WIDTH = Math.floor(canvas.width / TILE);
const HEIGHT = Math.floor(canvas.height / TILE);

for (let y = 0; y < HEIGHT; y++) {

    for (let x = 0; x < WIDTH; x++) {

        const value = fractalNoise(x, y);

        if (value < 0.35) {
            ctx.fillStyle = "#1E88E5";
        }
        else if (value < 0.40) {
            ctx.fillStyle = "#F4E19C";
        }
        else if (value < 0.70) {
            ctx.fillStyle = "#4CAF50";
        }
        else if (value < 0.85) {
            ctx.fillStyle = "#2E7D32";
        }
        else {
            ctx.fillStyle = "#9E9E9E";
        }

        ctx.fillRect(
            x * TILE,
            y * TILE,
            TILE,
            TILE
        );

    }

}