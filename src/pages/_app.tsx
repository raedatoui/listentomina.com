import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import localFont from 'next/font/local';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React from 'react';
import styles from '@/styles/Home.module.css';

const loveloFont = localFont({
    src: '../../public/fonts/Lovelo-Black.woff',
});

export default function App({ Component, pageProps }: AppProps) {
    const { pathname } = useRouter();
    // the homepage carries its own favicon; every other page keeps the site icon set
    const icons = (
        <Head>
            {pathname === '/' ? (
                <link rel="icon" type="image/jpeg" href="/favicon.jpg" />
            ) : (
                <>
                    <link rel="icon" type="image/png" sizes="32x32" href="/favicons/favicon-32x32.png" />
                    <link rel="icon" type="image/png" sizes="16x16" href="/favicons/favicon-16x16.png" />
                </>
            )}
        </Head>
    );

    // standalone pages (e.g. /saveme) render without the site shell
    if ((Component as AppProps['Component'] & { standalone?: boolean }).standalone) {
        return (
            <>
                {icons}
                <Component {...pageProps} />
            </>
        );
    }
    return (
        <>
            {icons}
            <main className={`${loveloFont.className}`}>
                <Link className={`${styles.title}`} id="logo" href="/">
                    <Image src="/images/logo.png" alt="logo" width={240} height={86} />
                </Link>
                <Component {...pageProps} />
                <footer className={`${styles.footer}`}>© 2026 jejune moon</footer>
            </main>
        </>
    );
}
