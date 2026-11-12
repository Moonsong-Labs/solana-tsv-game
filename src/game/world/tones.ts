/**
 * The colours each stock wears in town: its side of the pond, its vault's
 * belt and plate, its koi and its tokens. TSA keeps the pink the day was
 * painted in; the others take their tone from the stock list and shade it
 * the same way, so every pool reads as a sibling of the first.
 */
import * as THREE from 'three';

import { PALETTE } from '../scene/kit.ts';
import { STOCKS, type StockId } from '../sim/park.ts';

export interface StockTones {
    /** Its side of the pond's swirl: the stock's own tone. */
    water: string;
    /** A step deeper: its vault's belt, its gauge's liquid, its tokens. */
    deep: string;
    /** Its vault's name plate, dark enough to carry white text. */
    plate: string;
    /** Its koi, a little brighter than the water so the fish shows. */
    koi: string;
    /** The pale band round its tokens. */
    pale: string;
}

const TSA: StockTones = { water: '#f59bb0', deep: PALETTE.stock, plate: '#c9506a', koi: '#ff8fa6', pale: '#ffe3ea' };

const scratch = new THREE.Color();
const hsl = { h: 0, s: 0, l: 0 };

/** `hex` with its saturation scaled by `s` and its lightness set by `l` (from the old one). */
function shade(hex: string, s: number, l: (lightness: number) => number): string {
    scratch.set(hex).getHSL(hsl, THREE.SRGBColorSpace);
    scratch.setHSL(hsl.h, Math.min(1, hsl.s * s), THREE.MathUtils.clamp(l(hsl.l), 0, 1), THREE.SRGBColorSpace);
    return `#${scratch.getHexString(THREE.SRGBColorSpace)}`;
}

const cache = new Map<StockId, StockTones>([['TSA', TSA]]);

/** The tones of a stock's pool and tokens. */
export function stockTones(stock: StockId): StockTones {
    let tones = cache.get(stock);
    if (!tones) {
        const tone = STOCKS[stock].tone;
        // The same steps that lead from TSA's tone to its belt, plate and koi.
        tones = {
            water: tone,
            deep: shade(tone, 1.05, (l) => l - 0.08),
            plate: shade(tone, 0.8, (l) => Math.min(l - 0.24, 0.46)),
            koi: shade(tone, 1.2, (l) => l + 0.01),
            pale: shade(tone, 0.9, () => 0.92),
        };
        cache.set(stock, tones);
    }
    return tones;
}
