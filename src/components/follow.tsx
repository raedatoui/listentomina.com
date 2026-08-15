import Image from 'next/image';
import Link from 'next/link';
import styles from '@/styles/Section.module.css';

export default function Follow() {
    return (
        <section className={styles.section}>
            <h1 className={styles.sectionTitle}>Follow</h1>
            <div className={`${styles.iconGrid}`}>
                <Link href="https://www.instagram.com/listentomina" target="_blank">
                    <Image src="/images/insta.png" alt="Instagram" className={`${styles.icon}`} width={40 * 1.5} height={40 * 1.5} />
                </Link>
                <Link href="https://www.tiktok.com/@listentomina" target="_blank">
                    <Image src="/images/tiktok.png" alt="TikTok" className={`${styles.icon}`} width={35 * 1.5} height={40 * 1.5} />
                </Link>
                <Link href="mailto:hello@listentomina.com" target="_blank">
                    <Image src="/images/email.png" alt="TikTok" className={`${styles.icon}`} width={50 * 1.5} height={33.6 * 1.5} />
                </Link>
            </div>
        </section>
    );
}
