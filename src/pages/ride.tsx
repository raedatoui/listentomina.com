import React from 'react';
import Head from 'next/head';
import Single from '@/components/single';

const cover = { name: 'Ride', alt: 'Ride', file: 'light-single-ride.webp' };
const links = {
  spotify:
    'https://open.spotify.com/track/0pAINNQx8pPUrRkPWaZDu9?si=f4157c1ea81c4412',
  appleMusic: 'https://music.apple.com/us/album/ride/1739638059?i=1739638060',
  soundcloud: 'https://soundcloud.com/listentomina/ride',
  youtube: 'https://youtu.be/BdfKqGwtLR4?si=h2tr5AXoX_yB1vAJ',
  deezer: 'https://deezer.page.link/bF8Q4otbPU51vhge9',
};

export default function Home() {
  return (
    <>
      <Head>
        <title>Ride - Listen To Mina</title>
        <meta name="description" content="Ride - Listen to Mina" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <Single cover={cover} links={links} />
    </>
  );
}
