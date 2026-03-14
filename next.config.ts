import withPWA from '@ducanh2912/next-pwa'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
}

export default withPWA({
  dest: 'public',
  register: true,
  workboxOptions: {
    skipWaiting: true,
    runtimeCaching: [],
  },
})(nextConfig)
