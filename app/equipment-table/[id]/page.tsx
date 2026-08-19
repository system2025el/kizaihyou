import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  fetchEquipmentTable,
  fetchEquipmentTableHistory,
  fetchKizaiKindOptions,
  fetchKizaiOptions,
} from '@/app/_lib/equipment-table/funcs';
import { fetchJuchuTantoOptions } from '@/app/_lib/equipment-table-list/funcs';

import EquipmentTable from '../_ui/equipment-table';

export const metadata: Metadata = {
  title: '機材表',
  description: '機材表の内容を表示・編集する画面です',
};

const Page = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const kizaihyouId = Number(id);
  if (!Number.isInteger(kizaihyouId)) notFound();

  const [detail, kizaiOptions, kizaiKindOptions, juchuTantoOptions, history] = await Promise.all([
    fetchEquipmentTable(kizaihyouId),
    fetchKizaiOptions(),
    fetchKizaiKindOptions(),
    fetchJuchuTantoOptions(),
    fetchEquipmentTableHistory(kizaihyouId),
  ]);
  if (!detail) notFound();

  return (
    <EquipmentTable
      detail={detail}
      kizaiOptions={kizaiOptions}
      kizaiKindOptions={kizaiKindOptions}
      juchuTantoOptions={juchuTantoOptions}
      history={history}
    />
  );
};
export default Page;
