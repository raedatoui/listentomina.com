import React from 'react';
import styles from '@/styles/Section.module.css';
import Link from 'next/link';
import Image from 'next/image';

export default function Shop() {
  const onClick = () => {
    // @ts-ignore
    window.gtag('event', 'shop_clicked');
  };
  return (
    <section className={styles.section}>
      <h1 className={styles.sectionTitle}>Merch</h1>
      <div className={`${styles.iconGrid}`} onClick={onClick}>
        <Link href="https://listentomina.myshopify.com" target="_blank">
          <Image
            src="/images/merch.png"
            alt="Instagram"
            className={`${styles.icon}`}
            width={85}
            height={85}
          />
        </Link>
      </div>
    </section>
  );
}
