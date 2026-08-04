import { Metadata } from 'next';

import EquipmentTableList from './_ui/equipment-table-list';

export const metadata: Metadata = {
  title: '機材表履歴一覧',
  description: '機材表の履歴一覧画面です',
};

const Page = () => {
  return <EquipmentTableList />;
};
export default Page;
