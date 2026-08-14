import React, { useState } from 'react';
import styles from '../styles/Section.module.css';
import Release from '@/components/release';

const releases = [
    {
        cover: {
            name: 'The Ephemeral Trail',
            alt: 'The Ephemeral Trail',
            file: '/images/the ephemeral trail cover.jpg',
        },
        links: {
            spotify: '',
            appleMusic: '',
            soundcloud: 'https://soundcloud.com/listentomina/sets/the-ephemeral-trail/s-Gub7SsORtyC',
            youtube: '',
            deezer: '',
        },
        trackId: '2199235493',
        isPlaylist: true,
        secretToken: 's-Gub7SsORtyC',
    },
    {
        cover: {
            name: 'It Stays<br />(feat. Mina)',
            alt: 'It Stays',
            file: 'it-stays.jpg',
        },
        links: {
            spotify: 'https://open.spotify.com/track/2s7LkJjkrrQv6PKmVd9xTq?si=c37418f4eda5448d',
            appleMusic: 'https://music.apple.com/us/album/isnt-all-i-wanted-for/1724482558?i=1724482559',
            soundcloud: 'https://soundcloud.com/ludabuddha/it-stays-1',
            youtube: 'https://youtu.be/Uz6H7zqdQLM?si=0bYa9N4RdrYZmRi1',
            deezer: 'https://www.deezer.com/us/album/531343682',
        },
        trackId: '2308309883',
        adSupported: true,
    },
    {
        cover: {
            name: 'Disobey EP',
            alt: 'Disobey EP',
            file: 'ep-disobey.webp',
        },
        links: {
            spotify: 'https://open.spotify.com/track/17zHmJixa8XG4KXWOKoBF2?si=915ad66f23c24885',
            appleMusic: 'https://music.apple.com/us/album/disobey-single/1747009250',
            soundcloud: 'https://soundcloud.com/listentomina/sets/disobey-ep',
            youtube: 'https://youtu.be/NjJu7k483GE?si=fFsIT1G3UPL94twF',
            deezer: 'https://deezer.page.link/Q57rdDSxBzXD75fh9',
        },
        trackId: '1736700441',
        isPlaylist: true,
    },
    {
        cover: {
            name: 'Into The Woods<br />(feat. Mina)',
            alt: 'Into the Woods',
            file: 'into-the-woods.jpg',
        },
        links: {
            spotify: 'https://open.spotify.com/track/2s7LkJjkrrQv6PKmVd9xTq?si=c37418f4eda5448d',
            appleMusic: 'https://music.apple.com/us/album/isnt-all-i-wanted-for/1724482558?i=1724482559',
            soundcloud: 'https://soundcloud.com/ludabuddha/intothewoods',
            youtube: 'https://youtu.be/Uz6H7zqdQLM?si=0bYa9N4RdrYZmRi1',
            deezer: 'https://www.deezer.com/us/album/531343682',
        },
        trackId: '1794861490',
    },
];

export default function Releases() {
    const [toggledIndex, setToggledIndex] = useState<number | null>(null);

    const handleToggle = (index: number) => {
        setToggledIndex((prevIndex) => (prevIndex === index ? null : index));
    };

    return (
        <section className={styles.section}>
            <h1 className={styles.sectionTitle}>Releases</h1>
            <div className={styles.releaseGrid}>
                {releases.map((release, index) => (
                    <div key={index} className={`${styles.releaseGridItem} ${toggledIndex === index ? styles.expanded : ''}`}>
                        <Release release={release} isToggled={toggledIndex === index} onToggle={() => handleToggle(index)} />
                    </div>
                ))}
            </div>
        </section>
    );
}
