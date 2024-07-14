/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  env: {
    CDN_URL: 'https://storage.googleapis.com/typedef/out/',
    GTAG: 'false',
  },
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
