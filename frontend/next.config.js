/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // MVP content is hosted on Cloudinary (see spec section 22 — Content Hosting).
    // Add any other media hosts the backend team ends up using here.
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
  },
};

module.exports = nextConfig;
