import { Metadata } from 'next';

import EquipmentTable from './_ui/equipment-table';

export const metadata: Metadata = {
  title: '機材表',
  description: '機材表作成のモック画面です',
};

const Page = () => {
  return <EquipmentTable />;
};
export default Page;
