import { Alert, Box, Button } from '@mui/material';
import Link from 'next/link';

/**
 * メンバーでない人が機材表（やその過去の内容）を開いたときの表示。
 * 中身は一切渡さない。招待は持ち主がメンバー管理から行う。
 */
const EquipmentTableForbidden = () => (
  <Box p={4} display="flex" flexDirection="column" alignItems="flex-start" gap={2}>
    <Alert severity="warning">
      この機材表のメンバーではないため、開くことができません。見る必要がある場合は、機材表の持ち主に招待を頼んでください。
    </Alert>
    <Button component={Link} href="/equipment-table-list">
      機材表履歴一覧へ
    </Button>
  </Box>
);
export default EquipmentTableForbidden;
