import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

import styles from '@/styles/Section.module.css';

const links = [
  {
    href: 'https://listentomina.bandcamp.com',
    src: '/images/bc.png',
    alt: 'bandcamp',
    width: 40,
    height: 40,
  },
  {
    href: 'https://open.spotify.com/artist/4rm1J2o7smuSY3jxoqMLPI?si=2T6cae2aSNyqCVCrbZrQXw',
    src: '/images/spotify-sm.png',
    alt: 'spotify',
    width: 40,
    height: 40,
  },
  {
    href: 'https://music.apple.com/us/artist/mina/1711234446',
    src: '/images/apple.png',
    alt: 'apple',
    width: 40,
    height: 40,
  },
  {
    href: 'https://soundcloud.com/listentomina',
    src: '/images/soundcloud.png',
    alt: 'soundcloud',
    width: 60,
    height: 40,
  },
  {
    href: 'https://www.youtube.com/@ListentoMina',
    src: '/images/youtube.png',
    alt: 'youtube',
    width: 57,
    height: 40,
  },
  {
    href: 'https://www.deezer.com/us/artist/253963612?host=0&deferredFl=1',
    src: '/images/deezer.jpg',
    alt: 'deezer',
    width: 40,
    height: 40,
  },
];

export default function Listen() {
  return (
    <section className={styles.section}>
      <h1 className={styles.sectionTitle}>Listen</h1>
      <div className={`${styles.iconGrid}`}>
        {links.map((link, index) => (
          <Link key={index} href={link.href} target="_blank">
            <Image
              className={styles.icon}
              src={link.src}
              alt={link.alt}
              width={link.width * 1.5}
              height={link.height * 1.5}
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
