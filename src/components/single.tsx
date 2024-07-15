import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import styles from '@/styles/Single.module.css';

interface SingleProps {
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
}

export default function Single({ cover, links }: SingleProps) {
  return (
    <section className={styles.section2}>
      <div className={styles.container}>
        <div className={styles.grid}>
          <div className={styles.imageWrapper}>
            <Image
              alt={cover.alt}
              className={styles.image}
              height="750"
              src={`/images/covers/${cover.file}`}
              width="750"
            />
          </div>
          <div className={styles.content}>
            <div className={styles.heading}>
              <h1 className={styles.title}>{cover.name}</h1>
            </div>
            <div className={styles.buttons}>
              <Link href={links.spotify} target="_blank">
                <button className={`${styles.button} ${styles.spotifyButton}`}>
                  <span
                    className={`${styles.icon} ${styles.spotifyIcon}`}
                  ></span>
                  Listen on Spotify
                </button>
              </Link>
              <Link href={links.appleMusic} target="_blank">
                <button
                  className={`${styles.button} ${styles.appleMusicButton}`}
                >
                  <span
                    className={`${styles.icon} ${styles.appleMusicIcon}`}
                  ></span>
                  Listen on Apple Music
                </button>
              </Link>
              <Link href={links.soundcloud} target="_blank">
                <button
                  className={`${styles.button} ${styles.soundcloudButton}`}
                >
                  <span
                    className={`${styles.icon} ${styles.soundcloudIcon}`}
                  ></span>
                  Listen on SoundCloud
                </button>
              </Link>

              <Link href={links.youtube} target="_blank">
                <button className={`${styles.button} ${styles.youtubeButton}`}>
                  <span
                    className={`${styles.icon} ${styles.youtubeIcon}`}
                  ></span>
                  Listen on YouTube
                </button>
              </Link>

              <Link href={links.deezer} target="_blank">
                <button className={`${styles.button} ${styles.deezerButton}`}>
                  <span
                    className={`${styles.icon} ${styles.deezerIcon}`}
                  ></span>
                  Listen on Deezer
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
