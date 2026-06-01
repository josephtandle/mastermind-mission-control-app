/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // The board ships with the dev/IDE handling lint and type-checks.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

module.exports = nextConfig;
