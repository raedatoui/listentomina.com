import { Html, Head, Main, NextScript } from 'next/document';

import Script from 'next/script';
import React from 'react';

export default function Document() {
    return (
        <Html lang="en">
            <Head>
                <link rel="apple-touch-icon" sizes="180x180" href="/favicons/apple-touch-icon.png" />
                <link rel="icon" type="image/png" sizes="32x32" href="/favicons/favicon-32x32.png" />
                <link rel="icon" type="image/png" sizes="16x16" href="/favicons/favicon-16x16.png" />
                <link rel="manifest" href="/favicons/site.webmanifest" />
            </Head>
            <body>
                <Main />
                <NextScript />
                <Script strategy="afterInteractive" async src="https://www.googletagmanager.com/gtag/js?id=G-CZDQQDT6SF" />
                <Script
                    strategy="afterInteractive"
                    id="gtag"
                    async
                    dangerouslySetInnerHTML={{
                        __html: `
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', 'G-CZDQQDT6SF');
            `,
                    }}
                />
            </body>
        </Html>
    );
}
