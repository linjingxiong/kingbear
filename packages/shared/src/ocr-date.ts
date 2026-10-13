/**
 * OCR 识别出来的日期格式对（yyyy-MM-dd）不代表年份就靠谱——模型偶尔会把手写的"26"看成
 * "06"这种，格式完全合法但年份差了20年。入库单/出库单一般是当天或者近期补录的单据，
 * 不会是几年前/几年后的单据，超出这个范围就不自动填，留空逼着人工看一眼、手动选对，
 * 总比悄悄存错一个日期、事后根本想不到去哪找强。
 *
 * 前端（出库单识别自动填日期）和后端（入库单识别自动填日期）用的是同一条规则，
 * 不会出现"同样离谱的年份，这边拦了那边却悄悄存进去了"这种不一致。
 */
export function isPlausibleOcrDate(dateStr: string | null | undefined): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const maxFuture = new Date(now);
  maxFuture.setDate(maxFuture.getDate() + 30);
  const minPast = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
  return date <= maxFuture && date >= minPast;
}
