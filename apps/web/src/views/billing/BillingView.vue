<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import dayjs from "dayjs";
// 普通的 xlsx 包（社区版）不支持导出带底色的单元格样式，换成这个兼容同一套 API 的
// 分支（xlsx-js-style），才能给退货明细里每个产品的标题栏上色
import * as XLSX from "xlsx-js-style";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  BillPaymentStatus,
  calculateQuantity,
  hasBigQuantityDiff,
  type BillingDetailRow,
  type BillingSummary,
  type FactoryListItem,
} from "@kingbear/shared";
import { listFactories } from "../../api/factory";
import { getBillingSummary, updatePaymentStatus } from "../../api/billing";

const factories = ref<FactoryListItem[]>([]);
const factoryId = ref<string>("");
const yearMonth = ref<string>(dayjs().format("YYYY-MM"));
const summary = ref<BillingSummary | null>(null);
const loading = ref(false);

/** 下面按货号切换的 tab；空字符串是"全部"这个 tab */
const skuFilter = ref("");

/** 账期下拉：最近 12 个月，不用日期选择器那一套 */
const monthOptions = Array.from({ length: 12 }, (_, i) => dayjs().subtract(i, "month").format("YYYY-MM"));

/** 左边明细表跟着 tab 联动——选了具体货号就只看这个货号的流水，"全部"就是全部流水 */
const filteredDetails = computed(() => {
  if (!summary.value) return [];
  if (!skuFilter.value) return summary.value.details;
  return summary.value.details.filter((d) => d.sku === skuFilter.value);
});

/** 退货明细单独一份完整列表——上面的流水表是入库/退货混排、按日期看节奏用的，
 * 这里专门把这个账期里所有退货记录摘出来，不受货号 tab 筛选影响，一次性看全（不然
 * 混在几十条入库记录里翻着找不方便）。qty/amount 这里改成正数展示——反正整张表都是
 * 退货，不用再靠负号提醒 */
const returnDetails = computed(() => {
  if (!summary.value) return [];
  return summary.value.details
    .filter((d) => d.isReturn)
    .map((d) => ({ ...d, qty: Math.abs(d.qty), amount: Math.abs(d.amount) }));
});

async function loadFactories() {
  factories.value = await listFactories();
  if (!factoryId.value && factories.value.length) {
    // 默认优先选"美奇"，列表里没有的话（比如换了环境）再退回选第一个，不会白屏选不出来
    const preferred = factories.value.find((f) => f.name === "美奇");
    factoryId.value = (preferred ?? factories.value[0]).id;
  }
}

// 跟入库确认页、入库管理列表用同一份"相差超过 5 个算异常"的标准，账单上金额算得再准，
// 源头数量本身就录错的话也要能看出来。退货行的 qty 是负数，套用这套"申报数 vs 称重算出来的"
// 比较没有意义（一定会被判成"相差很大"），退货单自己录入时已经有过一遍这个检查了，这里跳过
function isBigQtyDiff(row: BillingDetailRow) {
  if (row.isReturn) return false;
  return hasBigQuantityDiff(row.qty, calculateQuantity(row.weightJin, row.unitWeightG));
}

// 金额是 0 大概率是这个货号在产品管理里还没设工厂价，账单上这一行等于白算了，得提醒去补上
function isZeroAmount(row: BillingDetailRow) {
  return row.amount === 0;
}

// 同一天、同货号、同数量——极可能是同一批货被重复录入到账单里了（比如入库那边强行
// 跳过了重复提醒）。这里拿全部明细（不受 tab 筛选影响）找一遍，出现次数 >1 的都标出来
const duplicateRowCounts = computed(() => {
  if (!summary.value) return new Map<string, number>();
  const counts = new Map<string, number>();
  for (const d of summary.value.details) {
    const key = `${d.date}|${d.sku}|${d.qty}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
});

function isDuplicateRow(row: BillingDetailRow) {
  return (duplicateRowCounts.value.get(`${row.date}|${row.sku}|${row.qty}`) ?? 0) > 1;
}

// 小图标不够显眼，有问题的这一整行都高亮，一眼就能扫到；具体是哪种问题看各自列上的小图标提示。
// 退货行也标红，但用比"数量异常"浅一点的红区分开——不是同一种"问题"，只是提醒这行是负数
function rowClassName({ row }: { row: BillingDetailRow }) {
  if (isBigQtyDiff(row) || isZeroAmount(row) || isDuplicateRow(row)) return "qty-diff-row";
  if (row.isReturn) return "return-row";
  return "";
}

// 玩具厂/账期下拉切换很快的时候（比如手滑连点了两次月份），网络延迟不保证请求
// 谁先谁后到——后发的（新选的月份）请求如果先回来，紧接着旧的（之前选的月份）请求
// 才姗姗来迟，会把新数据覆盖掉，页面上选着"8月"却显示着"9月"的数据。用一个自增票号，
// 只采纳"最后发出的那次请求"的结果，晚到的旧请求直接丢弃
let queryTicket = 0;

async function handleQuery() {
  if (!factoryId.value || !yearMonth.value) {
    ElMessage.warning("请选择玩具厂和时间范围");
    return;
  }
  const ticket = ++queryTicket;
  loading.value = true;
  skuFilter.value = "";
  try {
    const result = await getBillingSummary(factoryId.value, yearMonth.value);
    if (ticket !== queryTicket) return; // 这次请求发出去之后又有更新的查询发生了，这次的结果作废
    summary.value = result;
  } finally {
    // 同理：作废的这次也不该去关掉 loading——可能还有更新的那次请求正在飞着，
    // 关早了会出现"转圈还没转完就消失了"的闪烁
    if (ticket === queryTicket) loading.value = false;
  }
}

async function togglePaymentStatus() {
  if (!summary.value) return;
  const nextStatus =
    summary.value.status === BillPaymentStatus.Unpaid
      ? BillPaymentStatus.Paid
      : BillPaymentStatus.Unpaid;
  await ElMessageBox.confirm(
    `确定将「${summary.value.factoryName} ${summary.value.yearMonth}」标记为${
      nextStatus === BillPaymentStatus.Paid ? "已收款" : "未收款"
    }吗？`,
    "确认",
  );
  await updatePaymentStatus({ factoryId: factoryId.value, yearMonth: yearMonth.value, status: nextStatus });
  ElMessage.success("已更新");
  handleQuery();
}

// 导出当前对账单（这个玩具厂 + 这个账期）为 Excel：现在只有一张"汇总" sheet。
// 每个货号一段，左右并排两块——左边绿底"入库"、右边红底"退货"（没有退货就不出现这块），
// 最左边一列是竖向合并的产品名称，跨这个货号入库+退货的整个高度，一眼就知道这一大片
// 都是同一个产品的。所有货号排完之后，最后是"全部产品汇总"。
function exportExcel() {
  if (!summary.value) return;
  const s = summary.value;

  type CellStyle = {
    fill?: { patternType: string; fgColor: { rgb: string } };
    font?: { bold?: boolean; color?: { rgb: string } };
    alignment?: { horizontal?: string; vertical?: string; wrapText?: boolean };
  };
  const TITLE_STYLE: CellStyle = {
    fill: { patternType: "solid", fgColor: { rgb: "FF4472C4" } },
    font: { bold: true, color: { rgb: "FFFFFFFF" } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
  };
  const INBOUND_HEADER_STYLE: CellStyle = {
    fill: { patternType: "solid", fgColor: { rgb: "FF70AD47" } },
    font: { bold: true, color: { rgb: "FFFFFFFF" } },
    alignment: { horizontal: "center" },
  };
  const RETURN_HEADER_STYLE: CellStyle = {
    fill: { patternType: "solid", fgColor: { rgb: "FFC00000" } },
    font: { bold: true, color: { rgb: "FFFFFFFF" } },
    alignment: { horizontal: "center" },
  };
  const SUB_HEADER_STYLE: CellStyle = { font: { bold: true } };
  const INBOUND_TOTAL_STYLE: CellStyle = { font: { bold: true, color: { rgb: "FF2E7D32" } } };
  const RETURN_TOTAL_STYLE: CellStyle = { font: { bold: true, color: { rgb: "FFC0392B" } } };
  const NET_TOTAL_STYLE: CellStyle = {
    fill: { patternType: "solid", fgColor: { rgb: "FFF2F2F2" } },
    font: { bold: true },
  };

  // 列布局：A=产品名称，B-F=入库（时间/重量/克重/数量/金额），G=空一列隔开，H-L=退货（同样5列）
  const COL = { title: 0, inStart: 1, inEnd: 5, retStart: 7, retEnd: 11 };
  const TOTAL_COLS = 12;

  const grid: (string | number)[][] = [];
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  const styleCmds: { r: number; c: number; style: CellStyle }[] = [];

  function newRow(): number {
    grid.push(new Array(TOTAL_COLS).fill(""));
    return grid.length - 1;
  }
  function setCell(r: number, c: number, v: string | number) {
    grid[r][c] = v;
  }
  function styleRange(r: number, cStart: number, cEnd: number, style: CellStyle) {
    for (let c = cStart; c <= cEnd; c++) styleCmds.push({ r, c, style });
  }

  const perSkuTotals: { sku: string; name: string; inQty: number; inAmount: number; rQty: number; rAmount: number }[] = [];
  let totalInboundQty = 0;
  let totalInboundAmount = 0;

  for (const sku of s.bySku) {
    if (grid.length) newRow(); // 货号之间空一行

    const titleRow = newRow();
    styleRange(titleRow, COL.inStart, COL.inEnd, INBOUND_HEADER_STYLE);
    setCell(titleRow, COL.inStart, "入库");
    merges.push({ s: { r: titleRow, c: COL.inStart }, e: { r: titleRow, c: COL.inEnd } });

    const subHeaderRow = newRow();
    const inboundHeaders = ["时间", "重量/斤", "克重/g", "入库数量", "金额"];
    inboundHeaders.forEach((h, i) => setCell(subHeaderRow, COL.inStart + i, h));
    styleRange(subHeaderRow, COL.inStart, COL.inEnd, SUB_HEADER_STYLE);

    const inboundRows = s.details.filter((row) => row.sku === sku.sku && !row.isReturn);
    const skuReturnRows = returnDetails.value.filter((row) => row.sku === sku.sku);
    const hasReturn = skuReturnRows.length > 0;

    if (hasReturn) {
      setCell(titleRow, COL.retStart, "退货");
      styleRange(titleRow, COL.retStart, COL.retEnd, RETURN_HEADER_STYLE);
      merges.push({ s: { r: titleRow, c: COL.retStart }, e: { r: titleRow, c: COL.retEnd } });

      const returnHeaders = ["时间", "重量/斤", "克重/g", "退货数量", "金额"];
      returnHeaders.forEach((h, i) => setCell(subHeaderRow, COL.retStart + i, h));
      styleRange(subHeaderRow, COL.retStart, COL.retEnd, SUB_HEADER_STYLE);
    }

    // 入库、退货两边行数通常对不上（比如22条入库、8条退货），按较长的那边定行数，
    // 短的那边自然空着——两块share同一批行号，才能真正做到"左右并排"
    const dataRowCount = hasReturn ? Math.max(inboundRows.length, skuReturnRows.length) : inboundRows.length;
    let inQty = 0;
    let inAmount = 0;
    let rQty = 0;
    let rAmount = 0;
    for (let i = 0; i < dataRowCount; i++) {
      const r = newRow();
      if (i < inboundRows.length) {
        const row = inboundRows[i];
        setCell(r, COL.inStart, row.date);
        setCell(r, COL.inStart + 1, row.weightJin);
        setCell(r, COL.inStart + 2, row.unitWeightG);
        setCell(r, COL.inStart + 3, row.qty);
        setCell(r, COL.inStart + 4, row.amount);
        inQty += row.qty;
        inAmount += row.amount;
      }
      if (hasReturn && i < skuReturnRows.length) {
        const row = skuReturnRows[i];
        setCell(r, COL.retStart, row.date);
        setCell(r, COL.retStart + 1, row.weightJin);
        setCell(r, COL.retStart + 2, row.unitWeightG);
        setCell(r, COL.retStart + 3, row.qty);
        setCell(r, COL.retStart + 4, row.amount);
        rQty += row.qty;
        rAmount += row.amount;
      }
    }

    const totalRow = newRow();
    setCell(totalRow, COL.inStart, "总计");
    setCell(totalRow, COL.inStart + 3, inQty);
    setCell(totalRow, COL.inStart + 4, inAmount);
    styleRange(totalRow, COL.inStart, COL.inEnd, INBOUND_TOTAL_STYLE);
    if (hasReturn) {
      setCell(totalRow, COL.retStart, "总计");
      setCell(totalRow, COL.retStart + 3, rQty);
      setCell(totalRow, COL.retStart + 4, rAmount);
      styleRange(totalRow, COL.retStart, COL.retEnd, RETURN_TOTAL_STYLE);
    }

    // 产品名称：竖向合并，跨从标题栏到总计行的整个高度
    setCell(titleRow, COL.title, `${sku.sku} · ${sku.name}`);
    merges.push({ s: { r: titleRow, c: COL.title }, e: { r: totalRow, c: COL.title } });
    for (let r = titleRow; r <= totalRow; r++) styleCmds.push({ r, c: COL.title, style: TITLE_STYLE });

    totalInboundQty += inQty;
    totalInboundAmount += inAmount;
    perSkuTotals.push({ sku: sku.sku, name: sku.name, inQty, inAmount, rQty, rAmount });
  }

  // 全部产品汇总：先按产品列一遍各自入库/退货多少，再是三行总计
  newRow();
  const grandTitleRow = newRow();
  setCell(grandTitleRow, 0, "全部产品汇总");
  merges.push({ s: { r: grandTitleRow, c: 0 }, e: { r: grandTitleRow, c: TOTAL_COLS - 1 } });
  styleRange(grandTitleRow, 0, TOTAL_COLS - 1, TITLE_STYLE);

  const grandHeaderRow = newRow();
  ["货号", "名称", "入库数量", "入库金额", "退货数量", "退货金额"].forEach((h, i) => setCell(grandHeaderRow, i, h));
  styleRange(grandHeaderRow, 0, 5, SUB_HEADER_STYLE);
  for (const t of perSkuTotals) {
    const r = newRow();
    [t.sku, t.name, t.inQty, t.inAmount, t.rQty, t.rAmount].forEach((v, i) => setCell(r, i, v));
  }

  // "入库合计"对应 C/D 列，"退货合计"对应 E/F 列——跟上面表头的"入库数量/入库金额/
  // 退货数量/退货金额"对齐；"净应收合计"两个都不是，用"数量/金额"文字自己标出来
  const inboundTotalRow = newRow();
  setCell(inboundTotalRow, 0, "入库合计");
  setCell(inboundTotalRow, 2, totalInboundQty);
  setCell(inboundTotalRow, 3, totalInboundAmount);
  styleRange(inboundTotalRow, 0, 5, INBOUND_TOTAL_STYLE);

  const returnTotalRow = newRow();
  setCell(returnTotalRow, 0, "退货合计");
  setCell(returnTotalRow, 4, s.returnQty);
  setCell(returnTotalRow, 5, s.returnAmount);
  styleRange(returnTotalRow, 0, 5, RETURN_TOTAL_STYLE);

  const netTotalRow = newRow();
  setCell(netTotalRow, 0, "净应收合计");
  setCell(netTotalRow, 2, "数量");
  setCell(netTotalRow, 3, s.totalQty);
  setCell(netTotalRow, 4, "金额");
  setCell(netTotalRow, 5, s.totalAmount);
  styleRange(netTotalRow, 0, 5, NET_TOTAL_STYLE);

  const ws = XLSX.utils.aoa_to_sheet(grid);
  ws["!merges"] = merges;
  ws["!cols"] = [
    { wch: 16 }, // 产品名称
    { wch: 11 }, { wch: 9 }, { wch: 9 }, { wch: 10 }, { wch: 10 }, // 入库五列
    { wch: 3 }, // 空隔列
    { wch: 11 }, { wch: 9 }, { wch: 9 }, { wch: 10 }, { wch: 10 }, // 退货五列
  ];
  for (const { r, c, style } of styleCmds) {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!ws[ref]) ws[ref] = { t: "s", v: "" };
    ws[ref].s = style;
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "汇总");
  XLSX.writeFile(wb, `对账单_${s.factoryName}_${s.yearMonth}.xlsx`);
}

onMounted(async () => {
  await loadFactories();
  if (factoryId.value) handleQuery();
});
</script>

<template>
  <div class="billing-page">
    <!-- 玩具厂/账期的筛选查询直接放进对账单卡片里，不用再拆一张单独的卡片；
         这块不依赖 summary，选完就能点查询，不会因为还没查出结果就先被隐藏掉 -->
    <el-card class="statement-card">
      <div class="statement-title">
        <h2>应收对账单</h2>
        <div v-if="summary" class="statement-actions">
          <!-- 未收款还是用普通标签，一眼看出"还没处理"；已收款要的是那种正式单据盖了
               红章的感觉，一眼就笃定"这笔完事了"，所以单独做成印章样式，不再用小标签 -->
          <el-tag v-if="summary.status !== 'paid'" type="warning" size="large">未收款</el-tag>
          <el-button v-if="summary.bySku.length" link type="primary" @click="exportExcel">
            导出Excel
          </el-button>
          <el-button link type="primary" @click="togglePaymentStatus">
            标记为{{ summary.status === "paid" ? "未收款" : "已收款" }}
          </el-button>
        </div>
      </div>

      <div class="statement-meta">
        <el-form inline class="meta-form">
          <el-form-item label="玩具厂">
            <el-select v-model="factoryId" style="width: 200px" @change="handleQuery">
              <el-option v-for="f in factories" :key="f.id" :label="f.name" :value="f.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="账期">
            <el-select v-model="yearMonth" style="width: 160px" @change="handleQuery">
              <el-option v-for="m in monthOptions" :key="m" :label="m" :value="m" />
            </el-select>
          </el-form-item>
        </el-form>
      </div>

      <template v-if="summary">
        <template v-if="summary.bySku.length">
          <!-- 应收汇总在左，明细流水在右，横向并排；应收汇总永远是这个玩具厂这个月的全部应收，
               不随右边的 tab 切换变化——不管在看哪个货号的流水，应收合计都是同一个数 -->
          <div class="statement-row">
            <div class="statement-summary">
              <!-- 已收款：盖一个绿色印章上去，就压在"应收合计"这张单据卡片的右上角，
                   跟真实单据盖章在纸面上的感觉一样——之前放在页面标题区，旁边一大片
                   空白，看着像个孤立的装饰，不像盖在账单上 -->
              <div v-if="summary && summary.status === 'paid'" class="paid-stamp">
                <span class="paid-stamp-text">已收款</span>
              </div>
              <table class="summary-table">
                <thead>
                  <tr>
                    <th>货号</th>
                    <th>名称</th>
                    <th class="num">出货数量</th>
                    <th class="num">金额</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="s in summary.bySku" :key="s.sku">
                    <td>{{ s.sku }}</td>
                    <td>{{ s.name }}</td>
                    <td class="num">{{ s.qty.toLocaleString() }}</td>
                    <td class="num">¥{{ s.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <!-- 下面"应收合计"已经是扣完退货之后的净数——这一行只是让"退了多少"一眼看得到，
                       不是另外要加/减的数字 -->
                  <tr v-if="summary.returnAmount > 0" class="return-total-row">
                    <td colspan="2">其中：本期退货</td>
                    <td class="num">-{{ summary.returnQty.toLocaleString() }}</td>
                    <td class="num">-¥{{ summary.returnAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</td>
                  </tr>
                  <tr class="grand-total">
                    <td colspan="2">应收合计</td>
                    <td class="num">{{ summary.totalQty.toLocaleString() }}</td>
                    <td class="num">¥{{ summary.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div class="statement-detail-wrap">
              <!-- 按货号切换的 tab，点哪个货号下面明细表就只显示那一行的流水；"全部"tab 显示完整月度流水 -->
              <el-tabs v-model="skuFilter" class="sku-tabs">
                <el-tab-pane label="全部" name="" />
                <el-tab-pane v-for="s in summary.bySku" :key="s.sku" :label="`${s.sku} · ${s.name}`" :name="s.sku" />
              </el-tabs>

              <div class="statement-detail">
                <el-table :data="filteredDetails" border size="small" max-height="480" :row-class-name="rowClassName">
                  <el-table-column prop="date" label="日期" width="110" />
                  <el-table-column label="货号" width="90">
                    <template #default="{ row }">
                      {{ row.sku }}
                      <el-tooltip v-if="row.isReturn" :content="row.reason ? `退货原因：${row.reason}` : '退货'">
                        <el-tag type="danger" size="small" effect="plain">退</el-tag>
                      </el-tooltip>
                      <el-tooltip v-if="isDuplicateRow(row)" content="同一天、同货号、同数量的记录不止一条，疑似重复录入，请核对">
                        <el-icon class="qty-diff-icon"><WarningFilled /></el-icon>
                      </el-tooltip>
                    </template>
                  </el-table-column>
                  <!-- 名称固定宽度，太长就省略号+悬浮提示，不然名字一长整列被撑得很宽 -->
                  <el-table-column prop="name" label="名称" width="140" show-overflow-tooltip />
                  <el-table-column label="重量(斤)" width="90" align="right">
                    <template #default="{ row }">{{ row.weightJin }}</template>
                  </el-table-column>
                  <el-table-column label="单个克重(g)" width="110" align="right">
                    <template #default="{ row }">{{ row.unitWeightG }}</template>
                  </el-table-column>
                  <el-table-column label="出货数量" width="130" align="right">
                    <template #default="{ row }">
                      {{ row.qty.toLocaleString() }}
                      <el-tooltip
                        v-if="isBigQtyDiff(row)"
                        content="跟按重量算出来的数量相差超过 5 个，很可能录错了，建议核对"
                      >
                        <el-icon class="qty-diff-icon"><WarningFilled /></el-icon>
                      </el-tooltip>
                    </template>
                  </el-table-column>
                  <el-table-column label="工厂价" width="90" align="right">
                    <template #default="{ row }">{{ row.factoryPrice.toFixed(4) }}</template>
                  </el-table-column>
                  <el-table-column label="金额" width="120" align="right">
                    <template #default="{ row }">
                      ¥{{ row.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
                      <el-tooltip v-if="isZeroAmount(row)" content="金额是 0，很可能是这个货号在产品管理里还没设工厂价，去补一下">
                        <el-icon class="qty-diff-icon"><WarningFilled /></el-icon>
                      </el-tooltip>
                    </template>
                  </el-table-column>
                  <el-table-column label="附件" width="70" align="center">
                    <template #default="{ row }">
                      <el-image
                        v-if="row.imageUrl"
                        :src="row.imageUrl"
                        :preview-src-list="[row.imageUrl]"
                        preview-teleported
                        fit="cover"
                        class="detail-thumb"
                        :style="{ transform: `rotate(${row.rotation}deg)` }"
                      />
                      <span v-else class="muted">-</span>
                    </template>
                  </el-table-column>
                </el-table>
                <el-empty v-if="!filteredDetails.length" description="暂无流水" />
              </div>
            </div>
          </div>

          <!-- 完整退货明细：上面的流水表是入库/退货混排、按日期看节奏用的，退货记录本来就少，
               混在几十条入库记录里翻着找不方便，这里单独摘一份全的出来，不受货号 tab 筛选影响，
               有退货才显示这一块，没有就不占地方 -->
          <div v-if="returnDetails.length" class="return-section">
            <div class="return-section-title">退货明细（共 {{ returnDetails.length }} 条）</div>
            <el-table :data="returnDetails" border size="small" max-height="400">
              <el-table-column prop="date" label="日期" width="110" />
              <el-table-column prop="sku" label="货号" width="90" />
              <el-table-column prop="name" label="名称" width="140" show-overflow-tooltip />
              <el-table-column label="重量(斤)" width="90" align="right">
                <template #default="{ row }">{{ row.weightJin }}</template>
              </el-table-column>
              <el-table-column label="单个克重(g)" width="110" align="right">
                <template #default="{ row }">{{ row.unitWeightG }}</template>
              </el-table-column>
              <el-table-column label="退货数量" width="110" align="right">
                <template #default="{ row }">{{ row.qty.toLocaleString() }}</template>
              </el-table-column>
              <el-table-column label="工厂价" width="90" align="right">
                <template #default="{ row }">{{ row.factoryPrice.toFixed(4) }}</template>
              </el-table-column>
              <el-table-column label="退货金额" width="120" align="right">
                <template #default="{ row }">¥{{ row.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</template>
              </el-table-column>
              <el-table-column prop="reason" label="退货原因" width="140" show-overflow-tooltip>
                <template #default="{ row }">{{ row.reason || "-" }}</template>
              </el-table-column>
              <el-table-column label="凭证" width="70" align="center">
                <template #default="{ row }">
                  <el-image
                    v-if="row.imageUrl"
                    :src="row.imageUrl"
                    :preview-src-list="[row.imageUrl]"
                    preview-teleported
                    fit="cover"
                    class="detail-thumb"
                    :style="{ transform: `rotate(${row.rotation}deg)` }"
                  />
                  <span v-else class="muted">-</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </template>
        <el-empty v-else description="该月暂无入库记录" />
      </template>
    </el-card>
  </div>
</template>

<style scoped>
/* 让卡片一路撑到浏览器可视区域底部，而不是内容多高页面就多高、下面剩一大截空白。
   .main（BasicLayout 里滚动的那个容器）本身已经是撑满视口剩余高度的，这里只要
   让这个页面的根节点和卡片跟着一路 height:100% / flex:1 传下去就行 */
/* 之前这里是 height:100% 精确撑满可视区域、内部明细表 height="100%" 再吃掉剩余高度、
   表格自己滚动——这套设计的前提是"卡片里最后一块内容就是那张明细表"。后来加了退货明细
   这块内容要接在明细表下面，撑满视口的卡片就没地方给它，会跟明细表叠在一起。
   改成让卡片按内容自然撑高，整页交给 BasicLayout 的 .main 去滚动（它本来就有
   overflow:auto），明细表用 max-height 代替 height，数据少的时候刚好那么高，
   数据多才出现自己的滚动条——两种情况都不会跟下面的退货明细撞在一起 */
.billing-page {
  display: flex;
  flex-direction: column;
}

.statement-card {
  display: flex;
  flex-direction: column;
}

/* 绿色印章：双层圆圈 + 旋转 + 半透明，模拟盖在纸质单据上的实体章。挂在"应收合计"
   这张单据卡片的右上角、往外探出去一点，是真的"盖在单子上"，不是摆在页面标题区
   旁边一片空白里当装饰 */
.paid-stamp {
  position: absolute;
  top: -16px;
  right: -16px;
  width: 84px;
  height: 84px;
  border-radius: 50%;
  border: 2.5px solid #2e7d32;
  box-shadow: 0 0 0 2px #2e7d32 inset, 0 0 0 4.5px rgba(46, 125, 50, 0.35) inset;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(-16deg);
  opacity: 0.82;
  mix-blend-mode: multiply;
  pointer-events: none;
  z-index: 5;
  animation: stamp-in 0.25s ease-out;
}

.paid-stamp-text {
  color: #2e7d32;
  font-size: 16px;
  font-weight: 900;
  letter-spacing: 2px;
  writing-mode: horizontal-tb;
  text-align: center;
  line-height: 1.3;
}

@keyframes stamp-in {
  from {
    opacity: 0;
    transform: rotate(-16deg) scale(1.6);
  }
  to {
    opacity: 0.82;
    transform: rotate(-16deg) scale(1);
  }
}

.statement-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
}

/* 汇总信息、明细表、合计放进同一张卡片里，看着就是一张完整的对账单，
   不是拆成好几块互不相干的卡片 */
.statement-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid #ebeef5;
}

.statement-title h2 {
  margin: 0;
  font-size: 20px;
}

.statement-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.statement-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 32px;
  margin-bottom: 20px;
  font-size: 15px;
}

.meta-label {
  color: #909399;
  font-size: 13px;
  margin-right: 6px;
}

.meta-highlight {
  font-weight: 600;
  color: #e6a23c;
}

/* 应收合计在左，明细流水在右，横向并排；应收合计这块宽度只随内容走，不随明细表被拉宽，
   但高度要跟右边一样高（align-items: stretch），不能矮一截 */
.statement-row {
  display: flex;
  align-items: stretch;
  gap: 24px;
  margin-top: 16px;
}

.return-section {
  margin-top: 20px;
  flex: 0 0 auto;
}

.return-section-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
}

/* 应收合计只随内容撑高度就行，不跟着右边明细表一起被拉满——align-self: flex-start
   跳出 .statement-row 的 stretch，自己顶部对齐、多高算多高 */
.statement-summary {
  flex: 0 0 auto;
  align-self: flex-start;
  width: fit-content;
  background: #fff;
  padding: 4px 8px;
  border-radius: 6px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
  box-sizing: border-box;
  /* 印章绝对定位盖在这张"应收合计"单据卡片上，要靠这个立定位上下文 */
  position: relative;
}

/* 明细这一侧（tab + 表格）占满剩下的宽度 */
.statement-detail-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.sku-tabs {
  margin-top: 0;
  flex: 0 0 auto;
}

/* el-table 用 max-height 代替原来的 height="100%"：数据少就按内容自然高度显示，
   超过这个高度才出现表格自己的滚动条，不会撑满整个视口 */
.statement-detail {
  margin-top: 16px;
}

/* 按货号分开的汇总小表，做成正式单据常见的那种简洁线条风格（不是 el-table 那套），
   跟上面的明细表拉开层次，一眼看出这是"总结"不是"流水"；右对齐、不铺满整行 */
.summary-table {
  width: 100%;
  max-width: 560px;
  border-collapse: collapse;
  font-size: 14px;
}

.summary-table th,
.summary-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid #ebeef5;
}

.summary-table th {
  color: #909399;
  font-weight: 500;
  font-size: 13px;
}

.summary-table td.num,
.summary-table th.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.summary-table tfoot .grand-total td {
  border-bottom: none;
  border-top: 2px solid #303133;
  font-weight: 700;
  font-size: 16px;
  color: #e6a23c;
}

.detail-thumb {
  width: 36px;
  height: 36px;
  border-radius: 4px;
  cursor: zoom-in;
  vertical-align: middle;
}

.qty-diff-icon {
  color: #f56c6c;
  margin-left: 2px;
  vertical-align: middle;
  cursor: help;
}

/* row-class-name 加到的是 el-table 内部真实的 <tr>，scoped 样式要用 :deep() 穿透进去 */
:deep(.qty-diff-row td) {
  background-color: #fef0f0;
}

/* 退货行：数量/金额都是负数，整行标红——用比"数量异常"（#fef0f0）浅一点的红，
   两种情况看着还是能区分开，不会误以为退货也是录入出错 */
:deep(.return-row td) {
  background-color: #fff1f0;
  color: #f56c6c;
}

.return-total-row td {
  border-bottom: none;
  color: #f56c6c;
  font-size: 13px;
}

.muted {
  color: #c0c4cc;
}

/* 手机上应收合计和明细表并排会太挤，改成上下堆叠；应收合计这块也不用再 fit-content
   缩到很窄，直接占满宽度好读一些 */
@media (max-width: 768px) {
  .statement-row {
    flex-direction: column;
  }

  .statement-summary {
    width: 100%;
  }

  .summary-table {
    max-width: none;
  }
}
</style>
