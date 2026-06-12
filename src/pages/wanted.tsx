import React from 'react';
import Head from 'next/head';
import Single from '@/components/single';

const cover = {
    name: "ISN'T ALL I WANTED FOR",
    alt: 'Wanted For cover',
    file: 'light-single-wanted-for.webp',
};

const links = {
    spotify: 'https://open.spotify.com/track/2s7LkJjkrrQv6PKmVd9xTq?si=c37418f4eda5448d',
    appleMusic: 'https://music.apple.com/us/album/isnt-all-i-wanted-for/1724482558?i=1724482559',
    soundcloud: 'https://soundcloud.com/listentomina/isnt-all-i-wanted-for',
    youtube: 'https://youtu.be/Uz6H7zqdQLM?si=0bYa9N4RdrYZmRi1',
    deezer: 'https://www.deezer.com/us/album/531343682',
};

export default function Home() {
    return (
        <>
            <Head>
                <title>Isn&apos;t All I Wanted For - Listen To Mina</title>
                <meta name="description" content="Isn't All I wanted For - Listen to Mina" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>

            <Single cover={cover} links={links} />
        </>
    );
}
