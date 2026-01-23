/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-web-links'],
  webpack: (config, { isServer }) => {
    // Don't bundle xterm on server side
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push('@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-web-links');
    }
    return config;
  },
}

module.exports = nextConfig
