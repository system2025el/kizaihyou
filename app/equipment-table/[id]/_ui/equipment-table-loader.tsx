'use client';

import { Box, Typography } from '@mui/material';

import { useEquipmentTableListStore } from '@/app/_lib/equipment-table-list/store';
import EquipmentTable from '@/app/equipment-table/_ui/equipment-table';

type Props = { id: string };

const EquipmentTableLoader = ({ id }: Props) => {
  const listRow = useEquipmentTableListStore((state) => state.rows.find((row) => row.id === id));

  if (!listRow) {
    return (
      <Box p={2}>
        <Typography>対象の機材表が見つかりません。</Typography>
      </Box>
    );
  }

  return (
    <EquipmentTable
      title={`機材表 - ${listRow.id} ${listRow.eventName}`}
      initialColumns={listRow.content.columns}
      initialRows={listRow.content.rows}
    />
  );
};
export default EquipmentTableLoader;
