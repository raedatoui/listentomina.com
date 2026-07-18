import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import localFont from 'next/font/local';
import Image from 'next/image';
import Link from 'next/link';
import React from 'react';
import styles from '@/styles/Home.module.css';

const loveloFont = localFont({
    src: '../../public/fonts/Lovelo-Black.woff',
});

export default function App({ Component, pageProps }: AppProps) {
    // standalone pages (e.g. /saveme) render without the site shell
    if ((Component as AppProps['Component'] & { standalone?: boolean }).standalone) {
        return <Component {...pageProps} />;
    }
    return (
        <main className={`${loveloFont.className}`}>
            <Link className={`${styles.title}`} id="logo" href="/">
                <Image src="/images/logo.png" alt="logo" width={240} height={86} />
            </Link>
            <Component {...pageProps} />
            <footer className={`${styles.footer}`}>© 2026 jejune moon</footer>
        </main>
    );
}
