import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
    // A static site: the whole game, its simulated venue included, runs in
    // the browser and talks to nothing.
    output: 'export',
    // This folder is the project root. Naming it keeps Next from picking a
    // lockfile further up the disk when the checkout sits inside another
    // project.
    turbopack: { root: fileURLToPath(new URL('.', import.meta.url)) },
    // The dev badge would sit on top of the game's own controls.
    devIndicators: false,
};

export default nextConfig;
