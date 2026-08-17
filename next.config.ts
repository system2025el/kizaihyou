import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Excel出力はresources/kizaihyou-template.xlsmをfsで読むため、
  // ビルド成果物に含める（importしていないので自動では追跡されない）。
  outputFileTracingIncludes: {
    '/equipment-table/[id]': ['./resources/**'],
  },
};

export default nextConfig;
