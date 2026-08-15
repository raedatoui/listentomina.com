import localFont from 'next/font/local';
import Head from 'next/head';
import styles from '@/styles/SaveMe.module.css';

const lovelo = localFont({
    src: '../../public/fonts/Lovelo-Black.woff',
});

const TITLE = 'Never Gonna Survive (Save Me)';

const PARAGRAPHS = [
    'Based in Brooklyn, Mina is a producer, songwriter, and vocalist redefining dream pop with a sound that has been described as "earthy, transcendent, and delicate." Inspired by artists such as Portishead, Cocteau Twins, and Bat for Lashes, her style draws deeply from the atmospheric textures of 90s trip-hop and the lush, layered arrangements of dream pop.',
    '"Never Gonna Survive (Save Me)" is the lead single for Mina\'s upcoming EP, The Ephemeral Trail, co-produced with Elizabeth Maniscalco (BRUX). The track is about being trapped in a moment you want to get out of and understanding that you cannot do it alone. With such moments seeming to consume an increased share of our everyday lives, Mina sings her anxiety, which is an anxiety shared almost universally. We are all trying to deal with these sorts of situations constantly, and we rarely if ever know which path is the right way out, if any.',
    'Sonically, the track encapsulates this idea from its opening, disturbingly jagged, almost disharmonic chords, which slowly and seductively give way to a pleasant pulsing beat coated with synths. This soundscape perfectly evokes the feeling of being caught in a moment of familiar tension, one that could swerve into either anxiety or depression, and as the song blossoms into its finale and Mina calls out for someone to save her, we are reminded that the only thing that can save us is acknowledging that we are human, limited and fallible. In need of saving, but also capable of delivering our own salvation – through music and words, among other things.',
];

const InstagramIcon = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
);

export default function SaveMe() {
    return (
        <>
            <Head>
                <title>Mina — Never Gonna Survive (Save Me)</title>
                <meta name="description" content="Never Gonna Survive (Save Me) — the lead single from Mina's upcoming EP, The Ephemeral Trail." />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <meta property="og:title" content="Mina — Never Gonna Survive (Save Me)" />
                <meta
                    property="og:description"
                    content="Never Gonna Survive (Save Me) — the lead single from Mina's upcoming EP, The Ephemeral Trail."
                />
                <meta property="og:image" content="https://listentomina.com/images/saveme/cover.jpg" />
                <meta property="og:image:width" content="1200" />
                <meta property="og:image:height" content="1200" />
                <meta property="og:image:alt" content="Mina — Never Gonna Survive (Save Me)" />
                <meta property="og:type" content="website" />
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content="Mina — Never Gonna Survive (Save Me)" />
                <meta
                    name="twitter:description"
                    content="Never Gonna Survive (Save Me) — the lead single from Mina's upcoming EP, The Ephemeral Trail."
                />
                <meta name="twitter:image" content="https://listentomina.com/images/saveme/cover.jpg" />
            </Head>

            <main className={styles.page}>
                <div className={styles.bg} />
                <div className={styles.container}>
                    <header className={styles.header}>
                        <img src="/images/saveme/mina-logo-white.png" alt="Mina" className={styles.logo} />
                        <div className={styles.rule} />
                    </header>

                    <div className={styles.grid}>
                        <div className={styles.playerCol}>
                            <div className={styles.playerBox}>
                                <iframe
                                    title={TITLE}
                                    width="100%"
                                    height="300"
                                    scrolling="no"
                                    frameBorder="no"
                                    allow="autoplay; encrypted-media"
                                    src="https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/soundcloud%253Atracks%253A2287837421&color=%231c6ca6&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true"
                                />
                            </div>
                            <div className={styles.attribution}>
                                <a href="https://soundcloud.com/listentomina" title="Mina" target="_blank" rel="noreferrer">
                                    Mina
                                </a>
                                <span className={styles.separator}>·</span>
                                <a
                                    href="https://soundcloud.com/listentomina/never-gonna-survive-save-me"
                                    title="Never Gonna Survive (Save Me)"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Never Gonna Survive (Save Me)
                                </a>
                            </div>
                        </div>

                        <div className={styles.portraitBox}>
                            <img src="/images/saveme/portrait.png" alt="Mina" className={styles.portrait} />
                        </div>
                    </div>

                    <div className={styles.copy}>
                        <div className={styles.accent} />
                        <h1 className={`${lovelo.className} ${styles.title}`}>{TITLE}</h1>
                        <div className={styles.paragraphs}>
                            {PARAGRAPHS.map((p) => (
                                <p key={p}>{p}</p>
                            ))}
                        </div>
                    </div>
                </div>

                <footer className={styles.footer}>
                    <a href="https://jejunemoon.com/" target="_blank" rel="noopener noreferrer">
                        &copy; 2026 jejune moon
                    </a>
                    <a href="https://instagram.com/listentomina" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                        <InstagramIcon />
                    </a>
                </footer>
            </main>
        </>
    );
}

SaveMe.standalone = true;
