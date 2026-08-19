import { Metadata } from 'next';

import { fetchKizaiKindOptions, fetchKizaiOptions } from '@/app/_lib/equipment-table/funcs';
import { fetchJuchuTantoOptions } from '@/app/_lib/equipment-table-list/funcs';

import EquipmentTable from '../_ui/equipment-table';

export const metadata: Metadata = {
  title: '機材表（新規作成）',
  description: '機材表を新規作成する画面です',
};

/**
 * 新規作成の機材表画面。
 *
 * この時点ではDBにレコードを作らない（書きかけの機材表を機材表履歴一覧に
 * 出さないため）。最初の保存または申請で作成し、採番されたIDの画面に差し替える。
 */
const Page = async () => {
  const [kizaiOptions, kizaiKindOptions, juchuTantoOptions] = await Promise.all([
    fetchKizaiOptions(),
    fetchKizaiKindOptions(),
    fetchJuchuTantoOptions(),
  ]);

  return (
    <EquipmentTable
      detail={null}
      kizaiOptions={kizaiOptions}
      kizaiKindOptions={kizaiKindOptions}
      juchuTantoOptions={juchuTantoOptions}
      history={[]}
    />
  );
};
export default Page;
