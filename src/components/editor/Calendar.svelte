<script>
  import { dateRange, dayOfWeek, dayOfWeekJa, dayOfMonth } from '../../lib/utils/date.js';
  import { holidayOf } from '../../lib/data/holidays.js';
  import { calcBarHours } from '../../lib/types.js';
  import { makeRange, createBar } from '../../lib/utils/bars.js';

  /** @type {{
   *   block: import('../../lib/types.js').KojiBlock,
   *   periodStart: string,
   *   periodEnd: string,
   *   onChange: () => void,
   *   onPickKoushu: (cb: (label: string|null, opts?: {休工?: boolean}) => void) => void,
   *   onEditBar: (bandIdx: number, barIdx: number) => void,
   *   onEditCell: (date: string, key: '人員'|'重機'|'回送'|'車両'|'その他') => void
   * }} */
  let { block, periodStart, periodEnd, onChange, onPickKoushu, onEditBar, onEditCell } = $props();

  let dates = $derived(dateRange(periodStart, periodEnd));

  /** @type {{ band: number, date: string } | null} */
  let pendingStart = $state(null);

  const COL_WIDTH = 56;
  const LABEL_WIDTH = 96;
  const REMARK_WIDTH = 110;

  // 5つの固定行
  const FIXED_ROWS = /** @type {const} */ ([
    { key: '人員',   label: '人員',   種別: '人員' },
    { key: '重機',   label: '重機',   種別: '重機等' },
    { key: '回送',   label: '回送',   種別: '重機等' },
    { key: '車両',   label: '車両',   種別: '重機等' },
    { key: 'その他', label: 'その他', 種別: '重機等' }
  ]);

  /**
   * @param {number} bandIdx
   * @param {string} date
   */
  function onBandCellTap(bandIdx, date) {
    if (pendingStart && pendingStart.band === bandIdx) {
      const { 開始, 終了 } = makeRange(pendingStart.date, date);
      pendingStart = null;
      onPickKoushu((label, opts) => {
        if (!label) return;
        const bar = createBar(label, 開始, 終了);
        if (opts?.休工) bar.休工 = true;
        block.バンド[bandIdx].バー.push(bar);
        block.バンド = block.バンド;  // reactivity 明示
        onChange();
      });
    } else {
      pendingStart = { band: bandIdx, date };
    }
  }

  /** @param {number} bandIdx @param {number} barIdx @param {Event} ev */
  function onBarTap(bandIdx, barIdx, ev) {
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
    if (!confirm('最後の列（行）を削除します。バーや補足も消えます。よろしいですか？')) return;
    block.バンド.pop();
    block.バンド = block.バンド;
    onChange();
  }

  /** @param {string} date */
  function dayClass(date) {
    const dow = dayOfWeek(date);
    const hol = holidayOf(date);
    if (dow === 0 || dow === 6 || hol) return 'holiday';
    return '';
  }

  /** @param {string} date */
  function isPending(/** @type {number} */ bandIdx, date) {
    return pendingStart && pendingStart.band === bandIdx && pendingStart.date === date;
  }

  /** バーのグリッド配置（grid-column: start / end） */
  function barColumns(/** @type {import('../../lib/types.js').Bar} */ bar) {
    const sIdx = dates.indexOf(bar.開始);
    const eIdx = dates.indexOf(bar.終了);
    if (sIdx < 0 || eIdx < 0) return null;
    // grid列: 1=備考, 2=ラベル, 3..= 日付列(0始まりIdxに+3)
    return { start: sIdx + 3, end: eIdx + 4 };
  }

  /** 区分の色 */
  function kbnColor(/** @type {string} */ k) {
    if (k === 'リース') return '#1f6feb';
    if (k === '外注') return '#dc2626';
    return '#1a1a1a';
  }

  /** バンド行が空（ラベル未入力）かどうか */
  function isBandEmpty(/** @type {import('../../lib/types.js').Band} */ band) {
    return !band.ラベル || band.ラベル.trim() === '';
  }
</script>

<div class="cal-wrap">
  <div
    class="cal"
    style="
      --cw: {COL_WIDTH}px;
      --lw: {LABEL_WIDTH}px;
      --rw: {REMARK_WIDTH}px;
      grid-template-columns: var(--rw) var(--lw) repeat({dates.length}, var(--cw));
    "
  >
    <!-- 行1: ヘッダ -->
    <div class="cell head sticky-l1">補足</div>
    <div class="cell head sticky-l2">区分</div>
    {#each dates as d, i (d)}
      {@const hol = holidayOf(d)}
      <div class="cell head {dayClass(d)}" title={hol ?? ''}>
        <div class="dow">{dayOfWeekJa(d)}</div>
        <div class="dnum">{dayOfMonth(d)}</div>
      </div>
    {/each}

    <!-- バンド行 -->
    {#each block.バンド as band, bi (bi)}
      <!-- 補足列 -->
      <div class="cell remark sticky-l1">
        <input
          type="text"
          bind:value={band.備考}
          oninput={onChange}
          placeholder="補足"
          aria-label={`バンド${bi+1}の補足`}
        />
      </div>
      <!-- ラベル列 -->
      <div class="cell labelcell sticky-l2">
        <input
          type="text"
          bind:value={band.ラベル}
          oninput={onChange}
          placeholder={`作業${bi+1}`}
          aria-label={`バンド${bi+1}のラベル`}
        />
        <span class="sum">{band.バー.reduce((s, b) => s + calcBarHours(b), 0)}h</span>
      </div>
      <!-- 日付セル群 -->
      {#each dates as d, i (d)}
        <button
          class="cell band-cell {dayClass(d)} {isPending(bi, d) ? 'pending' : ''}"
          onclick={() => onBandCellTap(bi, d)}
          aria-label={`${d} 行${bi+1}`}
        ></button>
      {/each}
      <!-- バー（同じ行に grid-column 指定で重ねる） -->
      {#each band.バー as bar, idx (idx)}
        {@const cols = barColumns(bar)}
        {#if cols}
          <button
            class="bar {bar.休工 ? 'kyoko' : ''}"
            style="
              grid-column: {cols.start} / {cols.end};
              grid-row: {2 + bi};
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

    <!-- 行＋ボタン用の薄い行 -->
    <div class="cell ctrl-cell sticky-l1"></div>
    <div class="cell ctrl-cell sticky-l2">
      <div class="ctrl-buttons">
        <button class="mini" onclick={addBand}>＋項目</button>
        {#if block.バンド.length > 1}
          <button class="mini" onclick={removeBand}>−項目</button>
        {/if}
      </div>
    </div>
    {#each dates as d (d)}
      <div class="cell ctrl-cell"></div>
    {/each}

    <!-- 固定行: 人員/重機/回送/車両/その他 -->
    {#each FIXED_ROWS as row (row.key)}
      <div class="cell remark sticky-l1 muted-cell"></div>
      <div class="cell labelcell sticky-l2 muted-cell">{row.label}</div>
      {#each dates as d (d)}
        {@const cell = block.日次セル[d] ?? null}
        {@const v = cell?.[row.key] ?? ''}
        {@const k = cell?.[`${row.key}区分`] ?? '自社'}
        {@const anyBandHasLabel = block.バンド.some(b => !isBandEmpty(b))}
        <button
          class="cell day-cell {dayClass(d)}"
          disabled={!anyBandHasLabel}
          onclick={() => onEditCell(d, row.key)}
          aria-label={`${d} ${row.label}`}
        >
          {#if v}
            <span class="day-val" style="color: {kbnColor(k)}">{v}</span>
          {/if}
        </button>
      {/each}
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
    max-height: 70dvh;
  }
  .cal {
    display: grid;
    font-size: 12px;
    min-width: max-content;
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
    position: sticky;
    top: 0;
    z-index: 4;
  }
  .head .dow { font-size: 11px; color: var(--c-muted); }
  .head .dnum { font-size: 14px; }
  .head.holiday {
    background: var(--c-holiday);
  }

  /* 左に固定する2列 */
  .sticky-l1 {
    position: sticky;
    left: 0;
    z-index: 3;
    background: #fff;
  }
  .sticky-l2 {
    position: sticky;
    left: var(--rw);
    z-index: 3;
    background: #fff;
    border-right: 2px solid var(--c-border);
  }
  .head.sticky-l1 { z-index: 5; background: #f3f4f6; }
  .head.sticky-l2 { z-index: 5; background: #f3f4f6; }

  /* 補足列 */
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

  /* ラベル列 */
  .labelcell {
    padding: 2px 4px;
    flex-direction: column;
    align-items: stretch;
    justify-content: center;
    gap: 1px;
  }
  .labelcell input {
    width: 100%;
    min-height: 24px;
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
  .sum {
    font-size: 10px;
    color: var(--c-muted);
    text-align: right;
    padding-right: 6px;
  }

  .band-cell {
    cursor: pointer;
  }
  .band-cell.pending {
    background: #fff3a3;
    box-shadow: inset 0 0 0 2px #f59e0b;
  }

  /* バー（grid item） */
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

  /* コントロール行 */
  .ctrl-cell {
    background: #fafafa;
    min-height: 36px;
  }
  .ctrl-cell.labelcell, .ctrl-cell.sticky-l2 {
    justify-content: flex-start;
    padding: 0 6px;
  }
  .ctrl-buttons {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .mini {
    min-height: 28px;
    font-size: 11px;
    padding: 0 8px;
  }

  /* 固定行 */
  .muted-cell {
    background: #f8f9fa;
    font-size: 12px;
    color: var(--c-fg);
    font-weight: 500;
  }
  .muted-cell.sticky-l2 {
    background: #f8f9fa;
  }
  .day-cell {
    cursor: pointer;
  }
  .day-cell:disabled {
    background: #f3f4f6;
    cursor: not-allowed;
  }
  .day-cell.holiday:disabled {
    background: #f5e7c2;
  }
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
</style>
