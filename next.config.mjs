import withPWA from '@ducanh2912/next-pwa'

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'yt3.ggpht.com',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
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
