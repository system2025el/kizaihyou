import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  fetchEquipmentTableHistory,
  fetchEquipmentTablePage,
  fetchKizaiKindOptions,
  fetchKizaiOptions,
} from '@/app/_lib/equipment-table/funcs';
import { fetchJuchuTantoOptions } from '@/app/_lib/equipment-table-list/funcs';

import EquipmentTable from '../_ui/equipment-table';
import EquipmentTableForbidden from '../_ui/equipment-table-forbidden';

export const metadata: Metadata = {
  title: '機材表',
  description: '機材表の内容を表示・編集する画面です',
};

const Page = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const kizaihyouId = Number(id);
  if (!Number.isInteger(kizaihyouId)) notFound();

  // 先に権限を確かめる。メンバーでない人には中身もタイムラインも渡さない
  const page = await fetchEquipmentTablePage(kizaihyouId);
  if (!page) notFound();
  if (page.forbidden) return <EquipmentTableForbidden />;

  const [kizaiOptions, kizaiKindOptions, juchuTantoOptions, history] = await Promise.all([
    fetchKizaiOptions(),
    fetchKizaiKindOptions(),
    fetchJuchuTantoOptions(),
    fetchEquipmentTableHistory(kizaihyouId),
  ]);

  return (
    <EquipmentTable
      detail={page.detail}
      access={page.access}
      editStatus={page.editStatus}
      kizaiOptions={kizaiOptions}
      kizaiKindOptions={kizaiKindOptions}
      juchuTantoOptions={juchuTantoOptions}
      history={history}
    />
  );
};
export default Page;
