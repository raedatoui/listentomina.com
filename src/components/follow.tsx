import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import styles from '@/styles/Section.module.css';

export default function Follow() {
  return (
    <section className={styles.section}>
      <h1 className={styles.sectionTitle}>Follow</h1>
      <div className={`${styles.grid} ${styles.iconGrid}`}>
        <Link href="https://www.instagram.com/listentomina" target="_blank">
          <Image
            src="/images/insta.png"
            alt="Instagram"
            className={`${styles.icon}`}
            width={40}
            height={40}
          />
        </Link>
        <Link href="https://www.tiktok.com/@listentomina" target="_blank">
          <Image
            src="/images/tiktok.png"
            alt="TikTok"
            className={`${styles.icon}`}
            width={35}
            height={40}
          />
        </Link>
        <Link href="mailto:hello@listentomina.com" target="_blank">
          <Image
            src="/images/email.png"
            alt="TikTok"
            className={`${styles.icon}`}
            width={50}
            height={50}
          />
        </Link>
      </div>
    </section>
  );
}
