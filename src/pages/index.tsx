import React, { useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import localFont from 'next/font/local';
import styles from '@/styles/Home.module.css';
import Releases from '@/components/releases';
import Script from 'next/script';
import Listen from '@/components/listen';
import Follow from '@/components/follow';

const loveloFont = localFont({
  src: '../../public/fonts/Lovelo-Black.woff',
});

export default function Home() {
  const [scLoaded, setScLoaded] = useState(false);
  return (
    <>
      <Head>
        <title>Listen to Mina</title>
        <meta name="description" content="Listen to Mina" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={`${loveloFont.className}`}>
        <div className={`${styles.title}`}>
          <h1 className={`${styles.span}`}>Listen to</h1>
          <Image
            src="/images/logo.png"
            alt="logo"
            className={`${styles.span} ${styles.span2}`}
            width={240}
            height={86}
          />
        </div>
        <Image
          src="/images/avatar.jpg"
          alt="Listen to Mina"
          className={`${styles.avatar}`}
          width={1200}
          height={1500}
          priority
        />
        <Script
          src="https://w.soundcloud.com/player/api.js"
          onReady={() => setScLoaded(true)}
        />
        <div className={styles.content}>
          <Releases scLoaded={scLoaded} />
          <Listen />
          <Follow />
        </div>
      </main>
    </>
  );
}
