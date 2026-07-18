import React from 'react';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import localFont from 'next/font/local';
import styles from '@/styles/Home2.module.css';
import Releases from '@/components/releases';
import Listen from '@/components/listen';
import Follow from '@/components/follow';

const lovelo = localFont({
    src: '../../public/fonts/Lovelo-Black.woff',
});

export default function Home() {
    return (
        <>
            <Head>
                <title>Listen to Mina</title>
                <meta name="description" content="Listen to Mina" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <link rel="icon" href="/favicon.ico" />
            </Head>

            <main className={`${lovelo.className} ${styles.page}`}>
                <div className={styles.bg} />

                <header className={styles.header}>
                    <Link href="/" aria-label="Listen to Mina">
                        <Image src="/images/logo.png" alt="logo" width={240} height={86} className={styles.logo} />
                    </Link>
                    <div className={styles.rule} />
                </header>

                <div className={styles.container} id="container">
                    <div className={styles.content}>
                        <Releases />
                        <Listen />
                        <Follow />
                    </div>
                    <div className={styles.avatarContainer}>
                        <Image src="/images/saveme/portrait.png" alt="Listen to Mina" className={styles.avatar} width={1200} height={900} priority />
                    </div>
                </div>

                <footer className={styles.footer}>&copy; 2026 jejune moon</footer>
            </main>
        </>
    );
}

Home.standalone = true;
