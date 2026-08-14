import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { fetchEquipmentTable, fetchKizaiOptions } from '@/app/_lib/equipment-table/funcs';

import EquipmentTable from '../_ui/equipment-table';

export const metadata: Metadata = {
  title: '機材表',
  description: '機材表の内容を表示・編集する画面です',
};

const Page = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const kizaihyouId = Number(id);
  if (!Number.isInteger(kizaihyouId)) notFound();

  const [detail, kizaiOptions] = await Promise.all([fetchEquipmentTable(kizaihyouId), fetchKizaiOptions()]);
  if (!detail) notFound();

  return <EquipmentTable detail={detail} kizaiOptions={kizaiOptions} />;
};
export default Page;
