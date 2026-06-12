import React from 'react';
import Image from 'next/image';
import styles from '../styles/Releases.module.css';
import { Montserrat } from 'next/font/google';

const montserrat = Montserrat({
    weight: ['300', '400', '500', '700'],
    subsets: ['latin'],
    display: 'swap',
    fallback: ['Arial', 'sans-serif'],
});

type Release = {
    cover: {
        name: string;
        alt: string;
        file: string;
    };
    links: {
        spotify: string;
        appleMusic: string;
        soundcloud: string;
        youtube: string;
        deezer: string;
    };
    trackId: string;
    isPlaylist?: boolean;
    adSupported?: boolean;
};

interface ReleaseProps {
    release: Release;
    isToggled: boolean;
    onToggle: () => void;
}

export default function Release({ release, isToggled, onToggle }: ReleaseProps) {
    const resource = release.isPlaylist ? 'playlists' : 'tracks';

    if (isToggled) {
        return (
            <div className={styles.playerWrapper}>
                <button className={styles.closeButton} onClick={() => onToggle()} aria-label="Close player">
                    ✕
                </button>
                <iframe
                    className={styles.player}
                    title={release.cover.alt}
                    allow="autoplay; encrypted-media"
                    scrolling="no"
                    frameBorder="no"
                    src={`https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/${resource}/${release.trackId}&color=%23ec7a39&auto_play=${release.adSupported ? 'false' : 'true'}&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true`}
                ></iframe>
                <div className={styles.playerCaption}>
                    <a href="https://soundcloud.com/listentomina" title="Mina" target="_blank" rel="noopener noreferrer">
                        Mina
                    </a>
                    {' · '}
                    <a href={release.links.soundcloud} title={release.cover.alt} target="_blank" rel="noopener noreferrer">
                        {release.cover.alt}
                    </a>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className={styles.imageWrapper}>
                <Image
                    onClick={() => onToggle()}
                    height="180"
                    width="180"
                    src={`/images/covers/${release.cover.file}`}
                    alt={release.cover.alt}
                    className={styles.image}
                />
                <button className={styles.playButton} onClick={() => onToggle()}>
                    <svg viewBox="0 0 64 64" fill="currentColor">
                        <polygon points="16,8 56,32 16,56"></polygon>
                    </svg>
                </button>
            </div>
            <h4
                className={`${styles.title} ${montserrat.className}`}
                dangerouslySetInnerHTML={{
                    __html: `${release.cover.name}`,
                }}
            ></h4>
        </>
    );
}
