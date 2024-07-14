import React, { useState, useEffect } from 'react';
import styles from '../styles/Section.module.css';
import Release from '@/components/release';
import Dict = NodeJS.Dict;

const releases = [
  {
    cover: {
      name: 'Disobey',
      alt: 'Disobey',
      file: 'light-single-disobey.webp',
    },
    links: {
      spotify:
        'https://open.spotify.com/track/17zHmJixa8XG4KXWOKoBF2?si=915ad66f23c24885',
      appleMusic: 'https://music.apple.com/us/album/disobey-single/1747009250',
      soundcloud: 'https://soundcloud.com/listentomina/disobey',
      youtube: 'https://youtu.be/NjJu7k483GE?si=fFsIT1G3UPL94twF',
      deezer: 'https://deezer.page.link/Q57rdDSxBzXD75fh9',
    },
    trackId: '1687048272',
  },
  {
    cover: {
      name: 'Ride',
      alt: 'Ride',
      file: 'light-single-ride.webp',
    },
    links: {
      spotify:
        'https://open.spotify.com/track/0pAINNQx8pPUrRkPWaZDu9?si=f4157c1ea81c4412',
      appleMusic:
        'https://music.apple.com/us/album/ride/1739638059?i=1739638060',
      soundcloud: 'https://soundcloud.com/listentomina/ride',
      youtube: 'https://youtu.be/BdfKqGwtLR4?si=h2tr5AXoX_yB1vAJ',
      deezer: 'https://deezer.page.link/bF8Q4otbPU51vhge9',
    },
    trackId: '1687048563',
  },
  {
    cover: {
      name: "Isn't All I<br />Wanted For",
      alt: 'Wanted For cover',
      file: 'light-single-wanted-for.webp',
    },
    links: {
      spotify:
        'https://open.spotify.com/track/2s7LkJjkrrQv6PKmVd9xTq?si=c37418f4eda5448d',
      appleMusic:
        'https://music.apple.com/us/album/isnt-all-i-wanted-for/1724482558?i=1724482559',
      soundcloud: 'https://soundcloud.com/listentomina/isnt-all-i-wanted-for',
      youtube: 'https://youtu.be/Uz6H7zqdQLM?si=0bYa9N4RdrYZmRi1',
      deezer: 'https://www.deezer.com/us/album/531343682',
    },
    trackId: '1678391388',
  },
  {
    cover: {
      name: 'Into The Woods<br />(feat. Mina)',
      alt: 'Into the Woods',
      file: 'into-the-woods.jpg',
    },
    links: {
      spotify:
        'https://open.spotify.com/track/2s7LkJjkrrQv6PKmVd9xTq?si=c37418f4eda5448d',
      appleMusic:
        'https://music.apple.com/us/album/isnt-all-i-wanted-for/1724482558?i=1724482559',
      soundcloud: 'https://soundcloud.com/ludabuddha/intothewoods',
      youtube: 'https://youtu.be/Uz6H7zqdQLM?si=0bYa9N4RdrYZmRi1',
      deezer: 'https://www.deezer.com/us/album/531343682',
    },
    trackId: '1794861490',
  },
];

interface ReleaseProps {
  scLoaded: Boolean;
}

interface Widget {
  Events: {
    READY: string;
  };
  bind: (event: string, cb: () => void) => void;
  play: () => void;
  pause: () => void;
  (element: HTMLElement | null): Widget;
}

export default function Releases({ scLoaded }: ReleaseProps) {
  const [toggledIndex, setToggledIndex] = useState<number | null>(null);
  const [widgets, setWidgets] = useState<Record<string, Widget>>({});

  const handleToggle = (index: number) => {
    debugger;
    setToggledIndex(prevIndex => (prevIndex === index ? null : index));
  };

  const handleScLoaded = (trackId: string, widget: Widget) => {
    setWidgets(prevWidgets => ({
      ...prevWidgets,
      [trackId]: widget,
    }));
  };

  useEffect(() => {
    if (toggledIndex !== null && widgets[releases[toggledIndex].trackId]) {
      widgets[releases[toggledIndex].trackId].play();
    }

    return () => {
      if (toggledIndex !== null && widgets[releases[toggledIndex].trackId]) {
        widgets[releases[toggledIndex].trackId].pause();
      }
    };
  }, [toggledIndex, widgets, releases]);

  return (
    <section className={styles.section}>
      <h1 className={styles.sectionTitle}>Releases</h1>
      <div className={styles.grid}>
        {releases.map((release, index) => (
          <div key={index} className={styles.gridItem}>
            <Release
              release={release}
              scLoaded={scLoaded}
              isToggled={toggledIndex === index}
              onToggle={() => handleToggle(index)}
              onScLoaded={handleScLoaded}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
