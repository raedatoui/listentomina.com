import Effects from './effects';

// The Ephemeral Trail intro is the homepage; /effects stays live as its
// original URL. Same component, minus the engine's R / M / H shortcuts —
// visitors shouldn't be able to restart or dock the mark by typing.
export default function Home() {
    return <Effects withKeys={false} />;
}

Home.standalone = true;
