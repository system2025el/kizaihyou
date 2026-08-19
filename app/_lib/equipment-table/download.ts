/** Excel(.xlsm)のMIMEタイプ */
export const XLSM_MIME_TYPE = 'application/vnd.ms-excel.sheet.macroEnabled.12';
/** PDFのMIMEタイプ */
export const PDF_MIME_TYPE = 'application/pdf';

/**
 * Server Actionsから受け取ったbase64をファイルとしてダウンロードさせる関数。
 * Server Actionsはバイナリをそのまま返せないため、base64で受け取ってBlobに戻す。
 *
 * @param fileName ダウンロード時のファイル名
 * @param base64 ファイルの中身（base64）
 * @param mimeType ファイルのMIMEタイプ
 */
export const downloadBase64File = (fileName: string, base64: string, mimeType: string) => {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};
