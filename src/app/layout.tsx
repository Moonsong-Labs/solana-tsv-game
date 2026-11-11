import '@fontsource-variable/fredoka';
import '@fontsource-variable/nunito';
import './globals.css';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
    title: 'Gatekeeper · Solana TSV',
    description: "A playable demo of the Solana TSV venue: you are the pool's checks for one venue day.",
};

export const viewport: Viewport = { themeColor: '#fdf3df', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
