import React, { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import styles from '../styles/Releases.module.css';
import { Montserrat } from 'next/font/google';

interface Widget {
  Events: {
    READY: string;
  };
  bind: (event: string, cb: () => void) => void;
  play: () => void;
  pause: () => void;
  (element: HTMLElement | null): Widget;
}

declare global {
  interface Window {
    SC: {
      Widget: Widget;
    };
  }
}

const montserrat = Montserrat({
  weight: ['300', '400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
  fallback: ['Arial', 'sans-serif'],
});

type Release = {
  cover: {
    name: string;
    alt: string;
    file: string;
  };
  links: {
    spotify: string;
    appleMusic: string;
    soundcloud: string;
    youtube: string;
    deezer: string;
  };
  trackId: string;
};

interface ReleaseProps {
  release: Release;
  scLoaded: Boolean;
  isToggled: Boolean;
  onToggle: () => void;
  onScLoaded: (trackId: string, widget: Widget) => void;
}

export default function Release({
  release,
  scLoaded,
  isToggled,
  onToggle,
  onScLoaded,
}: ReleaseProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const handleScLoaded = (trackId: string) => {
    const w = window.SC.Widget(document.getElementById(trackId));
    onScLoaded(trackId, w);
    w.bind(window.SC.Widget.Events.READY, function () {
      onScLoaded(trackId, w);
    });
  };
  useEffect(() => {
    if (window.SC && iframeRef.current) {
      handleScLoaded(release.trackId);
    } else {
      setTimeout(() => {
        if (window.SC && iframeRef.current) {
          handleScLoaded(release.trackId);
        }
      }, 1000);
    }
  }, [release.trackId, iframeRef.current]);
  return (
    <>
      <div className={styles.imageWrapper}>
        <Image
          onClick={() => onToggle()}
          height="150"
          width="150"
          src={`/images/covers/${release.cover.file}`}
          alt={release.cover.alt}
          className={`${styles.image} ${isToggled ? styles.darkened : ''}`}
        />
        {scLoaded && (
          <button
            className={`${styles.playButton} ${isToggled ? styles.visible : ''}`}
            onClick={() => onToggle()}
          >
            {isToggled ? (
              <svg viewBox="0 0 64 64" fill="currentColor">
                <rect x="16" y="8" width="12" height="48"></rect>
                <rect x="36" y="8" width="12" height="48"></rect>
              </svg>
            ) : (
              <svg viewBox="0 0 64 64" fill="currentColor">
                <polygon points="16,8 56,32 16,56"></polygon>
              </svg>
            )}
          </button>
        )}
      </div>
      <h4
        className={`${styles.title} ${montserrat.className}`}
        dangerouslySetInnerHTML={{
          __html: `${release.cover.name}`,
        }}
      ></h4>
      <iframe
        ref={iframeRef}
        style={{ display: 'none' }}
        id={release.trackId}
        width="100%"
        height="20"
        allow="autoplay"
        src={`https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/${release.trackId}&color=%230d6d95&inverse=true&auto_play=false&show_user=true`}
      ></iframe>
    </>
  );
}
