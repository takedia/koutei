<script>
  import { dateRange, dayOfWeek, dayOfWeekJa, dayOfMonth } from '../../lib/utils/date.js';
  import { holidayOf } from '../../lib/data/holidays.js';
  import { calcBarHours, emptyDayCell, rebuildDayCells } from '../../lib/types.js';
  import { makeRange, createBar } from '../../lib/utils/bars.js';

  /** @type {{
   *   block: import('../../lib/types.js').KojiBlock,
   *   periodStart: string,
   *   periodEnd: string,
   *   onChange: () => void,
   *   onPickKoushu: (cb: (label: string|null, opts?: {休工?: boolean}) => void) => void,
   *   onEditBar: (bandIdx: number, barIdx: number) => void,
   *   onEditCell: (date: string, key: '人員'|'重機'|'回送'|'車両'|'その他', subIdx: number) => void
   * }} */
  let { block, periodStart, periodEnd, onChange, onPickKoushu, onEditBar, onEditCell } = $props();

  let dates = $derived(dateRange(periodStart, periodEnd));

  /** @type {{ band: number, date: string } | null} */
  let pendingStart = $state(null);

  const COL_WIDTH = 64;
  const LABEL_WIDTH = 110;
  const REMARK_WIDTH = 120;
  const TOTAL_WIDTH = 56;

  /** 固定行の定義 */
  const FIXED_KEYS = /** @type {const} */ ([
    { key: '人員',   label: '人員',   多: true  },
    { key: '重機',   label: '重機',   多: true  },
    { key: '回送',   label: '回送',   多: false },
    { key: '車両',   label: '車両',   多: true  },
    { key: 'その他', label: 'その他', 多: true  }
  ]);

  /** バンドセルのタップ */
  function onBandCellTap(/** @type {number} */ bandIdx, /** @type {string} */ date) {
    if (pendingStart && pendingStart.band === bandIdx) {
      const { 開始, 終了 } = makeRange(pendingStart.date, date);
      pendingStart = null;
      onPickKoushu((label, opts) => {
        if (!label) return;
        const bar = createBar(label, 開始, 終了);
        if (opts?.休工) bar.休工 = true;
        block.バンド[bandIdx].バー.push(bar);
        block.バンド = block.バンド;
        onChange();
      });
    } else {
      pendingStart = { band: bandIdx, date };
    }
  }

  /** @param {Event} ev */
  function onBarTap(/** @type {number} */ bandIdx, /** @type {number} */ barIdx, ev) {
    ev.stopPropagation();
    pendingStart = null;
    onEditBar(bandIdx, barIdx);
  }

  function addBand() {
    block.バンド.push({ ラベル: `作業${block.バンド.length + 1}`, 備考: '', バー: [] });
    block.バンド = block.バンド;
    onChange();
  }
  function removeBand() {
    if (block.バンド.length <= 1) return;
    if (!confirm('最後の項目を削除します。バーや補足も消えます。よろしいですか？')) return;
    block.バンド.pop();
    block.バンド = block.バンド;
    onChange();
  }

  /** 固定行の +/- */
  function addFixed(/** @type {keyof import('../../lib/types.js').固定行数} */ key) {
    block.固定行数[key]++;
    block.日次セル = rebuildDayCells(periodStart, periodEnd, block.固定行数, block.日次セル);
    onChange();
  }
  function removeFixed(/** @type {keyof import('../../lib/types.js').固定行数} */ key) {
    if (block.固定行数[key] <= 1) return;
    block.固定行数[key]--;
    block.日次セル = rebuildDayCells(periodStart, periodEnd, block.固定行数, block.日次セル);
    onChange();
  }

  /** 期間変更で日次セルが空の場合の保険 */
  $effect(() => {
    let needsRebuild = false;
    for (const d of dates) {
      if (!block.日次セル[d]) { needsRebuild = true; break; }
    }
    if (needsRebuild) {
      block.日次セル = rebuildDayCells(periodStart, periodEnd, block.固定行数, block.日次セル);
    }
  });

  /** @param {string} date */
  function dayClass(date) {
    const dow = dayOfWeek(date);
    const hol = holidayOf(date);
    if (dow === 0 || dow === 6 || hol) return 'holiday';
    return '';
  }

  function isPending(/** @type {number} */ bandIdx, /** @type {string} */ date) {
    return pendingStart && pendingStart.band === bandIdx && pendingStart.date === date;
  }

  /** バーの grid-column */
  function barColumns(/** @type {import('../../lib/types.js').Bar} */ bar) {
    const sIdx = dates.indexOf(bar.開始);
    const eIdx = dates.indexOf(bar.終了);
    if (sIdx < 0 || eIdx < 0) return null;
    // grid列: 1=ラベル, 2..N+1=日付, N+2=備考, N+3=合計
    return { start: sIdx + 2, end: eIdx + 3 };
  }

  function kbnColor(/** @type {string} */ k) {
    if (k === 'リース') return '#1f6feb';
    if (k === '外注') return '#dc2626';
    return '#1a1a1a';
  }

  function isBandEmpty(/** @type {import('../../lib/types.js').Band} */ band) {
    return !band.ラベル || band.ラベル.trim() === '';
  }

  let anyBandLabeled = $derived(block.バンド.some(b => !isBandEmpty(b)));

  /**
   * グリッド配置計算用：
   * row 1 = ヘッダ
   * バンド: rows 2..(2 + バンド数 - 1)
   * +項目行: row (2 + バンド数)
   * 固定行: その下
   */
  let bandStartRow = 2;
  let bandsCount = $derived(block.バンド.length);
  let ctrlRow = $derived(bandStartRow + bandsCount);
  let fixedStartRow = $derived(ctrlRow + 1);

  /** 各固定行キーの先頭rowを返すヘルパ */
  function fixedRowStart(/** @type {string} */ key) {
    let row = fixedStartRow;
    for (const f of FIXED_KEYS) {
      if (f.key === key) return row;
      row += block.固定行数[f.key] + 1; // +1 は +/-行
    }
    return row;
  }

  function getEntry(/** @type {string} */ date, /** @type {string} */ key, /** @type {number} */ idx) {
    return block.日次セル[date]?.[key]?.[idx] ?? { 値: '', 区分: '自社' };
  }
</script>

<div class="cal-wrap">
  <div
    class="cal"
    style="
      --cw: {COL_WIDTH}px;
      --lw: {LABEL_WIDTH}px;
      --rw: {REMARK_WIDTH}px;
      --tw: {TOTAL_WIDTH}px;
      grid-template-columns: var(--lw) repeat({dates.length}, var(--cw)) var(--rw) var(--tw);
    "
  >
    <!-- 行1: ヘッダ -->
    <div class="cell head sticky-l">項目</div>
    {#each dates as d (d)}
      {@const hol = holidayOf(d)}
      <div class="cell head {dayClass(d)}" title={hol ?? ''}>
        <div class="dow">{dayOfWeekJa(d)}</div>
        <div class="dnum">{dayOfMonth(d)}</div>
      </div>
    {/each}
    <div class="cell head">備考</div>
    <div class="cell head">合計</div>

    <!-- バンド -->
    {#each block.バンド as band, bi (bi)}
      <!-- ラベル -->
      <div class="cell labelcell sticky-l" style="grid-row: {bandStartRow + bi};">
        <input
          type="text"
          bind:value={band.ラベル}
          oninput={onChange}
          placeholder={`作業${bi+1}`}
          aria-label={`項目${bi+1}のラベル`}
        />
      </div>
      <!-- 日付セル -->
      {#each dates as d, i (d)}
        <button
          class="cell band-cell {dayClass(d)} {isPending(bi, d) ? 'pending' : ''}"
          style="grid-row: {bandStartRow + bi};"
          onclick={() => onBandCellTap(bi, d)}
          aria-label={`${d} 項目${bi+1}`}
        ></button>
      {/each}
      <!-- 備考 -->
      <div class="cell remark" style="grid-row: {bandStartRow + bi};">
        <input
          type="text"
          bind:value={band.備考}
          oninput={onChange}
          placeholder="備考"
        />
      </div>
      <!-- 合計 -->
      <div class="cell total" style="grid-row: {bandStartRow + bi};">
        {band.バー.reduce((s, b) => s + calcBarHours(b), 0)}h
      </div>

      <!-- バー（同じ行に重ねる） -->
      {#each band.バー as bar, idx (idx)}
        {@const cols = barColumns(bar)}
        {#if cols}
          <button
            class="bar {bar.休工 ? 'kyoko' : ''}"
            style="
              grid-column: {cols.start} / {cols.end};
              grid-row: {bandStartRow + bi};
              margin-left: {bar.始点位置 === 'AM' ? COL_WIDTH / 2 : 0}px;
              margin-right: {bar.終点位置 === 'PM' ? COL_WIDTH / 2 : 0}px;
            "
            onclick={(e) => onBarTap(bi, idx, e)}
            aria-label={`バー: ${bar.ラベル}`}
          >
            <div class="bar-main">{bar.ラベル}</div>
            {#if bar.サブラベル}<div class="bar-sub">{bar.サブラベル}</div>{/if}
            <div class="bar-h">{calcBarHours(bar)}h</div>
          </button>
        {/if}
      {/each}
    {/each}

    <!-- ＋/-項目行 -->
    <div class="cell labelcell sticky-l ctrl-row" style="grid-row: {ctrlRow};">
      <div class="ctrls">
        <button class="mini" onclick={addBand}>＋項目</button>
        {#if block.バンド.length > 1}
          <button class="mini" onclick={removeBand}>−項目</button>
        {/if}
      </div>
    </div>
    {#each dates as d (d)}
      <div class="cell ctrl-row" style="grid-row: {ctrlRow};"></div>
    {/each}
    <div class="cell ctrl-row" style="grid-row: {ctrlRow};"></div>
    <div class="cell ctrl-row" style="grid-row: {ctrlRow};"></div>

    <!-- 固定行 -->
    {#each FIXED_KEYS as f (f.key)}
      {@const startRow = fixedRowStart(f.key)}
      {@const N = block.固定行数[f.key]}
      <!-- N 個のサブ行 -->
      {#each Array.from({length: N}, (_, i) => i) as si (si)}
        <!-- ラベル：先頭サブ行のみ表示 -->
        {#if si === 0}
          <div class="cell labelcell sticky-l muted-cell" style="grid-row: {startRow} / span {N};">
            <span>{f.label}</span>
          </div>
        {/if}
        <!-- 日付セル -->
        {#each dates as d (d)}
          {@const e = getEntry(d, f.key, si)}
          <button
            class="cell day-cell {dayClass(d)}"
            style="grid-row: {startRow + si};"
            disabled={!anyBandLabeled}
            onclick={() => onEditCell(d, f.key, si)}
            aria-label={`${d} ${f.label}${N > 1 ? si+1 : ''}`}
          >
            {#if e.値}
              <span class="day-val" style="color: {kbnColor(e.区分)}">{e.値}</span>
            {/if}
          </button>
        {/each}
        <!-- 備考・合計（空セル） -->
        <div class="cell remark muted-cell" style="grid-row: {startRow + si};"></div>
        <div class="cell total muted-cell" style="grid-row: {startRow + si};"></div>
      {/each}

      <!-- +/-行（回送以外） -->
      {@const ctrlRowOfThisFixed = startRow + N}
      <div class="cell labelcell sticky-l ctrl-row muted-cell" style="grid-row: {ctrlRowOfThisFixed};">
        {#if f.多}
          <div class="ctrls">
            <button class="mini" onclick={() => addFixed(f.key)}>＋{f.label}</button>
            {#if N > 1}
              <button class="mini" onclick={() => removeFixed(f.key)}>−{f.label}</button>
            {/if}
          </div>
        {/if}
      </div>
      {#each dates as d (d)}
        <div class="cell ctrl-row muted-cell" style="grid-row: {ctrlRowOfThisFixed};"></div>
      {/each}
      <div class="cell ctrl-row muted-cell" style="grid-row: {ctrlRowOfThisFixed};"></div>
      <div class="cell ctrl-row muted-cell" style="grid-row: {ctrlRowOfThisFixed};"></div>
    {/each}
  </div>
</div>

<style>
  .cal-wrap {
    overflow: auto;
    border: 1px solid var(--c-border);
    border-radius: 8px;
    background: #fff;
    -webkit-overflow-scrolling: touch;
    max-height: 75dvh;
    /* sticky 子要素のために、これ自身をスクロール origin にする */
    contain: paint;
  }
  .cal {
    display: grid;
    font-size: 12px;
    min-width: max-content;
    width: max-content;
    background: #fff;
  }
  .cell {
    border-right: 1px solid var(--c-border);
    border-bottom: 1px solid var(--c-border);
    background: #fff;
    padding: 0;
    margin: 0;
    border-top: none;
    border-left: none;
    border-radius: 0;
    min-height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .cell.holiday {
    background: var(--c-holiday);
  }
  .head {
    background: #f3f4f6;
    flex-direction: column;
    line-height: 1.1;
    font-weight: 600;
    grid-row: 1;
    position: sticky;
    top: 0;
    z-index: 4;
  }
  .head .dow { font-size: 11px; color: var(--c-muted); }
  .head .dnum { font-size: 14px; }
  .head.holiday { background: var(--c-holiday); }

  /* ラベル列のみ sticky-left */
  .sticky-l {
    position: sticky;
    left: 0;
    z-index: 3;
    background: #fff;
    border-right: 2px solid var(--c-border);
  }
  .head.sticky-l { z-index: 5; background: #f3f4f6; }

  /* ラベルセル */
  .labelcell {
    padding: 2px 6px;
    flex-direction: column;
    align-items: stretch;
    justify-content: center;
    gap: 1px;
  }
  .labelcell input {
    width: 100%;
    min-height: 30px;
    padding: 2px 6px;
    font-size: 12px;
    font-weight: 600;
    border: none;
    background: transparent;
  }
  .labelcell input:focus {
    outline: 1px solid var(--c-accent);
    border-radius: 3px;
  }
  .labelcell input::placeholder {
    color: #cbd5e1;
  }
  .labelcell.muted-cell {
    background: #f8f9fa;
    align-items: center;
  }
  .labelcell.muted-cell span {
    font-weight: 600;
  }

  /* バンドセル */
  .band-cell { cursor: pointer; }
  .band-cell.pending {
    background: #fff3a3;
    box-shadow: inset 0 0 0 2px #f59e0b;
  }

  /* バー */
  .bar {
    align-self: center;
    justify-self: stretch;
    min-height: 32px;
    background: #fff;
    border: 1.5px solid #1a1a1a;
    border-radius: 4px;
    padding: 2px 8px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
    cursor: pointer;
    line-height: 1.15;
    text-align: left;
    z-index: 2;
    position: relative;
  }
  .bar.kyoko {
    background: repeating-linear-gradient(45deg, #fff, #fff 4px, #ddd 4px, #ddd 8px);
    border-color: #6b7280;
    color: #6b7280;
  }
  .bar-main {
    font-weight: 600;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bar-sub {
    font-size: 10px;
    color: var(--c-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bar-h {
    position: absolute;
    right: 4px;
    bottom: 1px;
    font-size: 9px;
    color: var(--c-muted);
    background: rgba(255,255,255,0.85);
    padding: 0 2px;
    border-radius: 2px;
  }

  /* 備考列 */
  .remark {
    padding: 2px 4px;
  }
  .remark input {
    width: 100%;
    min-height: 30px;
    padding: 2px 6px;
    font-size: 11px;
    border: none;
    background: transparent;
  }
  .remark input:focus {
    outline: 1px solid var(--c-accent);
    border-radius: 3px;
  }

  /* 合計 */
  .total {
    background: #f3f4f6;
    font-weight: 600;
    color: var(--c-accent);
    font-size: 12px;
  }
  .total.muted-cell { background: #f8f9fa; color: transparent; }

  /* コントロール行 */
  .ctrl-row {
    background: #fafafa;
    min-height: 30px;
  }
  .ctrl-row.labelcell {
    justify-content: flex-start;
    padding: 0 6px;
  }
  .ctrls {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .mini {
    min-height: 26px;
    font-size: 11px;
    padding: 0 6px;
  }

  /* 固定行 */
  .day-cell {
    cursor: pointer;
  }
  .day-cell:disabled {
    background: #f3f4f6;
    cursor: not-allowed;
  }
  .day-cell.holiday:disabled { background: #f5e7c2; }
  .day-val {
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
    text-align: center;
    padding: 0 2px;
    font-weight: 600;
  }
  .muted-cell {
    background: #f8f9fa;
  }
</style>
