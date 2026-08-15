import Image from 'next/image';
import Link from 'next/link';
import styles from '@/styles/Section.module.css';

export default function Shop() {
    const onClick = () => {
        // @ts-expect-error
        window.gtag('event', 'shop_clicked');
    };
    return (
        <section className={styles.section}>
            <h1 className={styles.sectionTitle}>Merch</h1>
            <div className={`${styles.iconGrid}`}>
                <Link href="https://listentomina.myshopify.com" target="_blank" onClick={onClick}>
                    <Image src="/images/merch.png" alt="Instagram" className={`${styles.icon}`} width={85} height={85} />
                </Link>
            </div>
        </section>
    );
}
