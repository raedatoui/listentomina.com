import Head from 'next/head';
import Image from 'next/image';
import localFont from 'next/font/local';
import coverStyles from '@/styles/Covers.module.css';
import Script from 'next/script';

const loveloFont = localFont({
  src: '../../public/fonts/Lovelo-Black.woff',
});

export default function Home() {
  const covers = [
    {
      name: 'Dark Single Ride',
      alt: 'Dark Single Ride cover',
      file: 'dark-single-ride.webp',
    },
    {
      name: 'Dark Single Disobey',
      alt: 'Dark Single Disobey cover',
      file: 'dark-single-disobey.webp',
    },
    {
      name: 'Dark Single Cant Go Back',
      alt: 'Dark Single Cant Go Back cover',
      file: 'dark-single-cant-go-back.webp',
    },
    {
      name: 'Dark Single Wanted For',
      alt: 'Dark Single Wanted For cover',
      file: 'dark-single-wanted-for.webp',
    },
    {
      name: 'Light Single Ride',
      alt: 'Light Single Ride cover',
      file: 'light-single-ride.webp',
    },
    {
      name: 'Light Single Disobey',
      alt: 'Light Single Disobey cover',
      file: 'light-single-disobey.webp',
    },
    {
      name: 'Light Single Cant Go Back',
      alt: 'Light Single Cant Go Back cover',
      file: 'light-single-cant-go-back.webp',
    },
    {
      name: 'Light Single Wanted For',
      alt: 'Light Single Wanted For cover',
      file: 'light-single-wanted-for.webp',
    },
    {
      name: 'Ep Disobey',
      alt: 'Ep Disobey cover',
      file: 'ep-disobey.webp',
    },
  ];
  return (
    <>
      <Head>
        <title>Listen to Mina</title>
        <meta name="description" content="Listen to Mina" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className={`${loveloFont.className}`}>
        <div className={`${coverStyles.gridContainer}`}>
          {covers.map((cover, index) => (
            <div className={`${coverStyles.gridItem}`} key={index}>
              <Image
                src={`/images/covers/${cover.file}`}
                alt={cover.alt}
                className={`${coverStyles.gridImage}`}
                width={750}
                height={750}
              />
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
