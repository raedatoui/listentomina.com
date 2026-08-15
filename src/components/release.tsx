import { Montserrat } from 'next/font/google';
import Image from 'next/image';
import styles from '../styles/Releases.module.css';

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
    secretToken?: string;
};

interface ReleaseProps {
    release: Release;
    isToggled: boolean;
    onToggle: () => void;
}

export default function Release({ release, isToggled, onToggle }: ReleaseProps) {
    const resource = release.isPlaylist ? 'playlists' : 'tracks';
    // unlisted sets only resolve in the widget with their secret token attached
    const secret = release.secretToken ? `%3Fsecret_token%3D${release.secretToken}` : '';

    if (isToggled) {
        return (
            <div className={styles.playerWrapper}>
                <button type="button" className={styles.closeButton} onClick={() => onToggle()} aria-label="Close player">
                    ✕
                </button>
                <iframe
                    className={styles.player}
                    title={release.cover.alt}
                    allow="autoplay; encrypted-media"
                    scrolling="no"
                    frameBorder="no"
                    src={`https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/${resource}/${release.trackId}${secret}&color=%23ec7a39&auto_play=${release.adSupported ? 'false' : 'true'}&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true`}
                />
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
                    // covers live in /images/covers; an absolute path opts out (the album reuses the intro's artwork)
                    src={release.cover.file.startsWith('/') ? release.cover.file : `/images/covers/${release.cover.file}`}
                    alt={release.cover.alt}
                    className={styles.image}
                />
                <button type="button" className={styles.playButton} onClick={() => onToggle()} aria-label={`Play ${release.cover.alt}`}>
                    <svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">
                        <polygon points="16,8 56,32 16,56" />
                    </svg>
                </button>
            </div>
            <h4
                className={`${styles.title} ${montserrat.className}`}
                // biome-ignore lint/security/noDangerouslySetInnerHtml: cover names carry a hardcoded <br /> (see the catalog in releases.tsx)
                dangerouslySetInnerHTML={{
                    __html: `${release.cover.name}`,
                }}
            />
        </>
    );
}
