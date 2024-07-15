import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import localFont from 'next/font/local';
import styles from '@/styles/Home.module.css';
import Releases from '@/components/releases';
import Script from 'next/script';
import Listen from '@/components/listen';
import Follow from '@/components/follow';

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

      <div className={`${styles.container}`} id="container">
        <div className={styles.content}>
          <Releases scLoaded={scLoaded} />
          <Listen />
          <Follow />
        </div>
        <div className={styles.avatarContainer}>
          <Image
            src="/images/avatar.jpg"
            alt="Listen to Mina"
            className={`${styles.avatar}`}
            width={1200}
            height={1500}
            priority
          />
        </div>
      </div>
      <Script
        src="https://w.soundcloud.com/player/api.js"
        onReady={() => setScLoaded(true)}
      />
    </>
  );
}
