/** The interface's icons, drawn inline so the app ships no image files. */
import type { ReactNode } from 'react';

function Svg({ children, size = 18 }: { children: ReactNode; size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {children}
        </svg>
    );
}

export const Icon = {
    /** The game's mark: a gate. */
    gate: (size?: number) => (
        <Svg size={size}>
            <path d="M3 6c6 2 12 2 18 0" />
            <path d="M5 10h14" />
            <path d="M7 6.8V21M17 6.8V21" />
        </Svg>
    ),
    play: (size?: number) => (
        <Svg size={size}>
            <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
        </Svg>
    ),
    pause: (size?: number) => (
        <Svg size={size}>
            <path d="M8 5v14M16 5v14" />
        </Svg>
    ),
    skip: (size?: number) => (
        <Svg size={size}>
            <path d="M4 5l8 7-8 7zM12 5l8 7-8 7z" fill="currentColor" />
        </Svg>
    ),
    sound: (size?: number) => (
        <Svg size={size}>
            <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" />
            <path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" />
        </Svg>
    ),
    mute: (size?: number) => (
        <Svg size={size}>
            <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" />
            <path d="M17 9.5l4 5M21 9.5l-4 5" />
        </Svg>
    ),
    check: (size?: number) => (
        <Svg size={size}>
            <path d="M5 12.5l4.5 4.5L19 7.5" />
        </Svg>
    ),
    cross: (size?: number) => (
        <Svg size={size}>
            <path d="M6 6l12 12M18 6L6 18" />
        </Svg>
    ),
    clock: (size?: number) => (
        <Svg size={size}>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 2" />
        </Svg>
    ),
    star: (size?: number) => (
        <Svg size={size}>
            <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z" fill="currentColor" />
        </Svg>
    ),
    flame: (size?: number) => (
        <Svg size={size}>
            <path
                d="M12 3c1 3.5 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 .2 1.6 1 2.4 1.8 2.6C10.200 8.500 11 6 12 3z"
                fill="currentColor"
            />
        </Svg>
    ),
    bulb: (size?: number) => (
        <Svg size={size}>
            <path d="M9 18h6M10 21h4M8.5 14.500A6 6 0 1115.500 14.500c-.6.5-1 1.300-1 2.100H9.500c0-.8-.4-1.600-1-2.100z" />
        </Svg>
    ),
    list: (size?: number) => (
        <Svg size={size}>
            <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
        </Svg>
    ),
    home: (size?: number) => (
        <Svg size={size}>
            <path d="M4 11l8-7 8 7M6 10v10h12V10" />
        </Svg>
    ),
    snow: (size?: number) => (
        <Svg size={size}>
            <path d="M12 3v18M4.2 7.5l15.600 9M19.800 7.500l-15.600 9M12 7l-2-2M12 7l2-2M12 17l-2 2M12 17l2 2" />
        </Svg>
    ),
    arrow: (size?: number) => (
        <Svg size={size}>
            <path d="M5 12h14M13 6l6 6-6 6" />
        </Svg>
    ),
    info: (size?: number) => (
        <Svg size={size}>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 11v5M12 8h.01" />
        </Svg>
    ),
    shield: (size?: number) => (
        <Svg size={size}>
            <path d="M12 3l7 3v5.500c0 4.300-3 7.500-7 9-4-1.500-7-4.700-7-9V6z" />
        </Svg>
    ),
    /** Manager mode's mark: the keys to the venue. */
    key: (size?: number) => (
        <Svg size={size}>
            <circle cx="8" cy="15" r="4.5" />
            <path d="M11.300 11.700L20 3M16.500 6.500l2.500 2.500M14 9l2 2" />
        </Svg>
    ),
    target: (size?: number) => (
        <Svg size={size}>
            <circle cx="12" cy="12" r="8.5" />
            <circle cx="12" cy="12" r="4.5" />
            <circle cx="12" cy="12" r="0.8" fill="currentColor" />
        </Svg>
    ),
    chevron: (size?: number) => (
        <Svg size={size}>
            <path d="M6 9l6 6 6-6" />
        </Svg>
    ),
    send: (size?: number) => (
        <Svg size={size}>
            <path d="M4 12l16-8-6 16-3-7z" />
            <path d="M11 13l9-9" />
        </Svg>
    ),
    restart: (size?: number) => (
        <Svg size={size}>
            <path d="M4.500 12a7.500 7.500 0 1 0 2.200-5.300" />
            <path d="M4 4v4.500h4.500" />
        </Svg>
    ),
    grid: (size?: number) => (
        <Svg size={size}>
            <path d="M4 4h6.500v6.500H4zM13.500 4H20v6.500h-6.500zM4 13.500h6.500V20H4zM13.500 13.500H20V20h-6.500z" />
        </Svg>
    ),
    circle: (size?: number) => (
        <Svg size={size}>
            <circle cx="12" cy="12" r="7.500" />
        </Svg>
    ),
    flag: (size?: number) => (
        <Svg size={size}>
            <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
        </Svg>
    ),
    back: (size?: number) => (
        <Svg size={size}>
            <path d="M19 12H5M11 6l-6 6 6 6" />
        </Svg>
    ),
    plus: (size?: number) => (
        <Svg size={size}>
            <path d="M12 5v14M5 12h14" />
        </Svg>
    ),
    /** Coins in a stack: funding. */
    coins: (size?: number) => (
        <Svg size={size}>
            <ellipse cx="12" cy="6.5" rx="7" ry="2.8" />
            <path d="M5 6.5v5c0 1.500 3.100 2.800 7 2.800s7-1.300 7-2.800v-5" />
            <path d="M5 11.500v5c0 1.500 3.100 2.800 7 2.800s7-1.300 7-2.800v-5" />
        </Svg>
    ),
    /** A balance: the books against the vault. */
    scale: (size?: number) => (
        <Svg size={size}>
            <path d="M12 4v16M7 20h10M5 7h14" />
            <path d="M5 7l-2.500 6a2.500 2.500 0 0 0 5 0zM19 7l-2.500 6a2.500 2.500 0 0 0 5 0z" />
        </Svg>
    ),
    /** A rolled paper: the trade policy. */
    scroll: (size?: number) => (
        <Svg size={size}>
            <path d="M8 4h10a2 2 0 0 1 2 2v1h-4" />
            <path d="M16 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1h10" />
            <path d="M8 4a2 2 0 0 0-2 2v11M10 9h4M10 13h4" />
        </Svg>
    ),
    /** A person: an owner, a broker. */
    user: (size?: number) => (
        <Svg size={size}>
            <circle cx="12" cy="8" r="3.800" />
            <path d="M4.500 20c.8-3.800 3.700-6 7.500-6s6.700 2.200 7.500 6" />
        </Svg>
    ),
    /** A raised hand: a hold. */
    hand: (size?: number) => (
        <Svg size={size}>
            <path d="M8 12V5.500a1.500 1.500 0 0 1 3 0V11M11 10.500V4a1.500 1.500 0 0 1 3 0v7M14 10.500V5.500a1.500 1.500 0 0 1 3 0V14" />
            <path d="M8 11.500l-1.400-1.800a1.600 1.600 0 0 0-2.600 1.800l3 5.200A6 6 0 0 0 12.200 20H13a4 4 0 0 0 4-4v-3" />
        </Svg>
    ),
    unlock: (size?: number) => (
        <Svg size={size}>
            <rect x="4.500" y="10.500" width="15" height="10" rx="2" />
            <path d="M8 10.500V7a4 4 0 0 1 7.700-1.500" />
        </Svg>
    ),
    undo: (size?: number) => (
        <Svg size={size}>
            <path d="M9 14L4 9l5-5" />
            <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
        </Svg>
    ),
    /** A mast that sends: the halt poster. */
    antenna: (size?: number) => (
        <Svg size={size}>
            <path d="M12 11v10M9 21h6" />
            <circle cx="12" cy="9" r="1.800" />
            <path d="M8.200 5.200a5.400 5.400 0 0 0 0 7.600M15.800 5.200a5.400 5.400 0 0 1 0 7.600" />
        </Svg>
    ),
};
