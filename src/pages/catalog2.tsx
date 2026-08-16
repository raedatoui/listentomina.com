import Head from 'next/head';
import Image from 'next/image';
import Follow from '@/components/follow';
import Listen from '@/components/listen';
import Releases from '@/components/releases';
import styles from '@/styles/Home.module.css';

export default function Catalog2() {
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
                    <Releases />
                    <Listen />
                    <Follow />
                </div>
                <div className={styles.avatarContainer}>
                    <Image src="/images/avatar.jpg" alt="Listen to Mina" className={`${styles.avatar}`} width={1200} height={1500} priority />
                </div>
            </div>
        </>
    );
}
