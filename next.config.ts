import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Excel出力はresources/kizaihyou-template.xlsm、PDF出力はresources/fonts/ipaexg.ttfを
  // fsで読むため、ビルド成果物に含める（importしていないので自動では追跡されない）。
  outputFileTracingIncludes: {
    '/equipment-table/[id]': ['./resources/**'],
    '/equipment-table/[id]/snapshot/[hisId]': ['./resources/**'],
  },
};

export default nextConfig;
