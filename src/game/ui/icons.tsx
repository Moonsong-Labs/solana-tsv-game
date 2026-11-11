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
};
