import Head from 'next/head';
import Single from '@/components/single';

const cover = {
    name: 'Disobey',
    alt: 'Disobey',
    file: 'light-single-disobey.webp',
};
const links = {
    spotify: 'https://open.spotify.com/track/17zHmJixa8XG4KXWOKoBF2?si=915ad66f23c24885',
    appleMusic: 'https://music.apple.com/us/album/disobey-single/1747009250',
    soundcloud: 'https://soundcloud.com/listentomina/disobey',
    youtube: 'https://youtu.be/NjJu7k483GE?si=fFsIT1G3UPL94twF',
    deezer: 'https://deezer.page.link/Q57rdDSxBzXD75fh9',
};

export default function Home() {
    return (
        <>
            <Head>
                <title>Disobey - Listen To Mina</title>
                <meta name="description" content="Disobey - Listen to Mina" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>

            <Single cover={cover} links={links} />
        </>
    );
}
