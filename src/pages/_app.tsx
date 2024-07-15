import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import styles from '@/styles/Home.module.css';
import Image from 'next/image';
import React from 'react';
import localFont from 'next/font/local';
import Link from 'next/link';

const loveloFont = localFont({
  src: '../../public/fonts/Lovelo-Black.woff',
});

export default function App({ Component, pageProps }: AppProps) {
  return (
    <main className={`${loveloFont.className}`}>
      <Link className={`${styles.title}`} id="logo" href="/">
        <Image src="/images/logo.png" alt="logo" width={240} height={86} />
      </Link>
      <Component {...pageProps} />
    </main>
  );
}
