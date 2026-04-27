<script>
  import { dateRange, dayOfWeek, dayOfWeekJa, dayOfMonth } from '../../lib/utils/date.js';
  import { holidayOf } from '../../lib/data/holidays.js';
  import { calcBarHours, rebuildDayCells } from '../../lib/types.js';
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

  /** @type {{ band: number, startDate: string, endDate: string } | null} */
  let dragging = $state(null);
  /** @type {{ band: number, date: string } | null} */
  let pendingTap = $state(null);
  let dragMoved = $state(false);

  const COL_WIDTH = 64;
  const KEY_WIDTH = 38;       // 項目名（人員/重機 等）の固定列
  const SUB_WIDTH = 76;       // サブ行ラベル（自社/外注 等）の固定列
  const REMARK_WIDTH = 120;
  const TOTAL_WIDTH = 56;

  /** 固定行：回送も多重対応 */
  const FIXED_KEYS = /** @type {const} */ ([
    { key: '人員',   label: '人員',   多: true },
    { key: '重機',   label: '重機',   多: true },
    { key: '回送',   label: '回送',   多: true },
    { key: '車両',   label: '車両',   多: true },
    { key: 'その他', label: 'その他', 多: true }
  ]);

  // ──── ドラッグ選択 ────

  /**
   * @param {number} bandIdx
   * @param {string} date
   * @param {PointerEvent} ev
   */
  function onCellPointerDown(bandIdx, date, ev) {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    pendingTap = { band: bandIdx, date };
    dragging = { band: bandIdx, startDate: date, endDate: date };
    dragMoved = false;
    /** @type {HTMLElement} */ (ev.currentTarget).setPointerCapture?.(ev.pointerId);
  }

  /**
   * @param {PointerEvent} ev
   */
  function onCellPointerMove(ev) {
    if (!dragging) return;
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const cell = /** @type {HTMLElement|null} */ (el?.closest?.('[data-band-cell]') ?? null);
    if (!cell) return;
    const bandIdx = Number(cell.dataset.band);
    const d = cell.dataset.date;
    if (!d) return;
    if (bandIdx !== dragging.band) return;
    if (d !== dragging.endDate) {
      dragging = { ...dragging, endDate: d };
      if (d !== dragging.startDate) dragMoved = true;
    }
  }

  /**
   * @param {PointerEvent} ev
   */
  function onCellPointerUp(ev) {
    if (!dragging) return;
    const { band, startDate, endDate } = dragging;
    const wasDragMoved = dragMoved;
    dragging = null;
    pendingTap = null;
    dragMoved = false;

    const { 開始, 終了 } = makeRange(startDate, endDate);
    onPickKoushu((label, opts) => {
      if (!label) return;
      const bar = createBar(label, 開始, 終了);
      if (opts?.休工) bar.休工 = true;
      block.バンド[band].バー.push(bar);
      block.バンド = block.バンド;
      onChange();
      const newBarIdx = block.バンド[band].バー.length - 1;
      onEditBar(band, newBarIdx);
    });
  }

  function onCellPointerCancel() {
    dragging = null;
    pendingTap = null;
    dragMoved = false;
  }

  /** ドラッグ中の選択範囲に含まれるか */
  function inDrag(/** @type {number} */ bandIdx, /** @type {string} */ date) {
    if (!dragging || dragging.band !== bandIdx) return false;
    const a = dragging.startDate <= dragging.endDate ? dragging.startDate : dragging.endDate;
    const b = dragging.startDate <= dragging.endDate ? dragging.endDate : dragging.startDate;
    return date >= a && date <= b;
  }

  /** @param {Event} ev */
  function onBarTap(/** @type {number} */ bandIdx, /** @type {number} */ barIdx, ev) {
    ev.stopPropagation();
    onEditBar(bandIdx, barIdx);
  }

  function addBand() {
    block.バンド.push({ ラベル: `作業${block.バンド.length + 1}`, 備考: '', バー: [] });
    block.バンド = block.バンド;
    onChange();
  }
  function removeBand() {
    if (block.バンド.length <= 1) return;
    if (!confirm('最後の列を削除します。バーや備考も消えます。よろしいですか？')) return;
    block.バンド.pop();
    block.バンド = block.バンド;
    onChange();
  }

  function addFixed(/** @type {keyof import('../../lib/types.js').固定行数} */ key) {
    block.固定行数[key]++;
    // 新サブ行のデフォルトラベル
    const arr = block.固定行ラベル[key] ?? [];
    let next;
    if (key === '人員') next = arr.length === 0 ? '自社' : (arr.length === 1 ? '外注' : `外注${arr.length}`);
    else next = arr.length === 0 ? '自社' : (arr.length === 1 ? 'リース' : `リース${arr.length}`);
    block.固定行ラベル[key] = [...arr, next];
    block.日次セル = rebuildDayCells(periodStart, periodEnd, block.固定行数, block.日次セル);
    onChange();
  }
  function removeFixed(/** @type {keyof import('../../lib/types.js').固定行数} */ key) {
    if (block.固定行数[key] <= 1) return;
    block.固定行数[key]--;
    block.固定行ラベル[key] = block.固定行ラベル[key].slice(0, block.固定行数[key]);
    block.日次セル = rebuildDayCells(periodStart, periodEnd, block.固定行数, block.日次セル);
    onChange();
  }

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

  function kbnColor(/** @type {string} */ k) {
    if (k === 'リース') return '#1f6feb';
    if (k === '外注') return '#dc2626';
    return '#1a1a1a';
  }

  /** 非人員: 区分に応じて [リース]/[外注] を付与、自社は無印 */
  function cellSuffix(/** @type {string} */ key, /** @type {string} */ kbn) {
    if (key === '人員') return '';   // 人員はサブ行ラベルが区分の代わり
    if (kbn === 'リース') return '[リース]';
    if (kbn === '外注')   return '[外注]';
    return '';
  }
  /** セル文字色：人員はサブ行ラベル基準、他は cell.区分 基準 */
  function cellColor(/** @type {string} */ key, /** @type {string} */ kbn, /** @type {string} */ subLabel) {
    if (key === '人員') {
      if (subLabel && (subLabel === '外注' || subLabel.startsWith('外注'))) return '#dc2626';
      return '#1a1a1a';
    }
    return kbnColor(kbn);
  }

  function isBandEmpty(/** @type {import('../../lib/types.js').Band} */ band) {
    return !band.ラベル || band.ラベル.trim() === '';
  }

  let anyBandLabeled = $derived(block.バンド.some(b => !isBandEmpty(b)));

  // 行レイアウト
  let bandStartRow = 2;
  let bandsCount = $derived(block.バンド.length);
  let ctrlRow = $derived(bandStartRow + bandsCount);
  let fixedStartRow = $derived(ctrlRow + 1);

  /** @param {string} key */
  function fixedRowStart(key) {
    let row = fixedStartRow;
    for (const f of FIXED_KEYS) {
      if (f.key === key) return row;
      row += block.固定行数[f.key] + (f.多 ? 1 : 0);
    }
    return row;
  }

  function getEntry(/** @type {string} */ date, /** @type {string} */ key, /** @type {number} */ idx) {
    return block.日次セル[date]?.[key]?.[idx] ?? { 値: '', 区分: '自社' };
  }

  /** 人員サブ行の合計（数値のみ加算） */
  function sumPerson(/** @type {number} */ si) {
    let sum = 0;
    for (const d of dates) {
      const v = block.日次セル[d]?.人員?.[si]?.値;
      const n = Number(v);
      if (!isNaN(n) && v !== '') sum += n;
    }
    return sum;
  }

  /** バーの日数列の grid-column インデックス（col 1=key, col 2=sub-label, col 3+=日付） */
  function colIdxOf(/** @type {string} */ date) {
    const i = dates.indexOf(date);
    return i < 0 ? -1 : i + 3;
  }

  /** バーの日付配列 */
  function barDays(/** @type {import('../../lib/types.js').Bar} */ bar) {
    return dateRange(bar.開始, bar.終了).filter(d => dates.includes(d));
  }

  /** バーのバルーン文字列（HTML title 属性用） */
  function buildBarTitle(/** @type {import('../../lib/types.js').Bar} */ bar) {
    const parts = [bar.ラベル];
    if (bar.サブラベル) parts.push(bar.サブラベル);
    const total = calcBarHours(bar);
    if (total) parts.push(`${total}h`);
    if (bar.休工) parts.push('休工');
    if (bar.日別) {
      const half = Object.entries(bar.日別).filter(([_, v]) => v !== '全日');
      if (half.length) parts.push(half.map(([d, v]) => `${d.slice(5)} ${v}`).join(', '));
    }
    return parts.join(' / ');
  }
</script>

<div class="cal-wrap">
  <div
    class="cal"
    style="
      --cw: {COL_WIDTH}px;
      --kw: {KEY_WIDTH}px;
      --slw: {SUB_WIDTH}px;
      --rw: {REMARK_WIDTH}px;
      --tw: {TOTAL_WIDTH}px;
      grid-template-columns: var(--kw) var(--slw) repeat({dates.length}, minmax(var(--cw), max-content)) var(--rw) var(--tw);
    "
  >
    <!-- 行1: ヘッダ -->
    <div class="cell head sticky-l1" style="grid-column: 1 / 3; grid-row: 1;">項目</div>
    {#each dates as d, i (d)}
      {@const hol = holidayOf(d)}
      <div class="cell head {dayClass(d)}" title={hol ?? ''} style="grid-column: {i+3}; grid-row: 1;">
        <div class="dow">{dayOfWeekJa(d)}</div>
        <div class="dnum">{dayOfMonth(d)}</div>
      </div>
    {/each}
    <div class="cell head" style="grid-column: {dates.length + 3}; grid-row: 1;">備考</div>
    <div class="cell head" style="grid-column: {dates.length + 4}; grid-row: 1;">合計</div>

    <!-- バンド -->
    {#each block.バンド as band, bi (bi)}
      <!-- ラベル -->
      <div class="cell labelcell sticky-l1" style="grid-column: 1 / 3; grid-row: {bandStartRow + bi};">
        <input
          type="text"
          bind:value={band.ラベル}
          oninput={onChange}
          placeholder={`作業${bi+1}`}
          aria-label={`項目${bi+1}のラベル`}
        />
      </div>
      <!-- 日付セル（ドラッグ受付） -->
      {#each dates as d, i (d)}
        <button
          class="cell band-cell {dayClass(d)} {inDrag(bi, d) ? 'pending' : ''}"
          style="grid-column: {i + 3}; grid-row: {bandStartRow + bi};"
          data-band-cell="1"
          data-band={bi}
          data-date={d}
          onpointerdown={(e) => onCellPointerDown(bi, d, e)}
          onpointermove={onCellPointerMove}
          onpointerup={onCellPointerUp}
          onpointercancel={onCellPointerCancel}
          aria-label={`${d} 項目${bi+1}`}
        ></button>
      {/each}
      <!-- 備考 -->
      <div class="cell remark" style="grid-column: {dates.length + 3}; grid-row: {bandStartRow + bi};">
        <input
          type="text"
          bind:value={band.備考}
          oninput={onChange}
          placeholder="備考"
        />
      </div>
      <!-- 合計 -->
      <div class="cell total" style="grid-column: {dates.length + 4}; grid-row: {bandStartRow + bi};">
        {band.バー.reduce((s, b) => s + calcBarHours(b), 0)}h
      </div>

      <!-- バー：視覚セグメント（日ごと）+ ラベル（バー全範囲に収まる別グリッドアイテム） -->
      {#each band.バー as bar, idx (idx)}
        {@const days = barDays(bar)}
        {@const sIdx = dates.indexOf(bar.開始)}
        {@const eIdx = dates.indexOf(bar.終了)}
        {@const sCol = sIdx + 3}
        {@const eCol = eIdx + 3}
        {#each days as d, di (d)}
          {@const col = colIdxOf(d)}
          {@const state = bar.日別?.[d] ?? '全日'}
          {#if col >= 2}
            <button
              class="bar-seg {state.toLowerCase()} {bar.休工 ? 'kyoko' : ''} {di === 0 ? 'is-first' : ''} {di === days.length - 1 ? 'is-last' : ''}"
              style="grid-column: {col}; grid-row: {bandStartRow + bi};"
              onclick={(e) => onBarTap(bi, idx, e)}
              aria-label={`バー: ${bar.ラベル}`}
            ></button>
          {/if}
        {/each}
        {#if sCol >= 2 && eCol >= 2}
          <div
            class="bar-label"
            style="grid-column: {sCol} / {eCol + 1}; grid-row: {bandStartRow + bi};"
            title={buildBarTitle(bar)}
          >
            <span class="bar-main">{bar.ラベル}</span>
            {#if bar.サブラベル}<span class="bar-sub">{bar.サブラベル}</span>{/if}
            <span class="bar-h">{calcBarHours(bar)}h</span>
          </div>
        {/if}
      {/each}
    {/each}

    <!-- ＋/-列の行 -->
    <div class="cell labelcell sticky-l1 ctrl-row" style="grid-column: 1 / 3; grid-row: {ctrlRow};">
      <div class="ctrls">
        <button class="mini" onclick={addBand}>＋列追加</button>
        {#if block.バンド.length > 1}
          <button class="mini" onclick={removeBand}>−列削除</button>
        {/if}
      </div>
    </div>
    {#each dates as d, i (d)}
      <div class="cell ctrl-row" style="grid-column: {i + 3}; grid-row: {ctrlRow};"></div>
    {/each}
    <div class="cell ctrl-row" style="grid-column: {dates.length + 3}; grid-row: {ctrlRow};"></div>
    <div class="cell ctrl-row" style="grid-column: {dates.length + 4}; grid-row: {ctrlRow};"></div>

    <!-- 固定行 -->
    {#each FIXED_KEYS as f (f.key)}
      {@const startRow = fixedRowStart(f.key)}
      {@const N = block.固定行数[f.key]}

      <!-- 項目名セル（rowspan: 全サブ行を縦断） -->
      {#if f.key === '人員'}
        <!-- 人員: col 1 のみ（サブラベル列は別） -->
        <div class="cell key-cell sticky-l1 muted-cell" style="grid-column: 1; grid-row: {startRow} / span {N};">
          <span class="key-text">{f.label}</span>
        </div>
      {:else}
        <!-- 他: col 1+2 をマージ（サブラベル無し） -->
        <div class="cell key-cell-wide sticky-l1 muted-cell" style="grid-column: 1 / 3; grid-row: {startRow} / span {N};">
          <span class="key-text">{f.label}</span>
        </div>
      {/if}

      {#each Array.from({length: N}, (_, i) => i) as si (si)}
        {#if f.key === '人員'}
          <!-- 人員のサブラベルセル（col 2） -->
          <div class="cell sub-label-cell sticky-l2 muted-cell" style="grid-column: 2; grid-row: {startRow + si};">
            <input
              type="text"
              class="sub-label-input"
              bind:value={block.固定行ラベル[f.key][si]}
              oninput={onChange}
              placeholder={si === 0 ? '自社' : `外注${si > 1 ? si : ''}`}
              aria-label={`${f.label}${si+1}のサブ行ラベル`}
            />
          </div>
        {/if}
        {#each dates as d, i (d)}
          {@const e = getEntry(d, f.key, si)}
          {@const suffix = cellSuffix(f.key, e.区分)}
          {@const color = cellColor(f.key, e.区分, block.固定行ラベル[f.key][si])}
          <button
            class="cell day-cell {dayClass(d)}"
            style="grid-column: {i + 3}; grid-row: {startRow + si};"
            disabled={!anyBandLabeled}
            onclick={() => onEditCell(d, f.key, si)}
            aria-label={`${d} ${f.label}${N > 1 ? si+1 : ''}`}
          >
            {#if e.値}
              <span class="day-val" style="color: {color}">{e.値}{suffix}</span>
            {/if}
          </button>
        {/each}
        <div class="cell remark muted-cell" style="grid-column: {dates.length + 3}; grid-row: {startRow + si};"></div>
        <div class="cell total {f.key === '人員' ? '' : 'muted-cell'}" style="grid-column: {dates.length + 4}; grid-row: {startRow + si};">
          {#if f.key === '人員'}
            {@const s = sumPerson(si)}
            {s > 0 ? s : ''}
          {/if}
        </div>
      {/each}

      {#if f.多}
        {@const ctrlRowOfThisFixed = startRow + N}
        <div class="cell labelcell sticky-l1 ctrl-row-fixed muted-cell" style="grid-column: 1 / 3; grid-row: {ctrlRowOfThisFixed};">
          <div class="ctrls">
            <button class="mini" onclick={() => addFixed(f.key)}>＋{f.label}</button>
            {#if N > 1}
              <button class="mini" onclick={() => removeFixed(f.key)}>−{f.label}</button>
            {/if}
          </div>
        </div>
        {#each dates as d, i (d)}
          <div class="cell ctrl-row-fixed muted-cell" style="grid-column: {i + 3}; grid-row: {ctrlRowOfThisFixed};"></div>
        {/each}
        <div class="cell ctrl-row-fixed muted-cell" style="grid-column: {dates.length + 3}; grid-row: {ctrlRowOfThisFixed};"></div>
        <div class="cell ctrl-row-fixed muted-cell" style="grid-column: {dates.length + 4}; grid-row: {ctrlRowOfThisFixed};"></div>
      {/if}
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
  .cell.holiday { background: var(--c-holiday); }

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
  .head.holiday { background: var(--c-holiday); }

  .sticky-l1 {
    position: sticky;
    left: 0;
    z-index: 3;
    background: #fff;
  }
  .sticky-l2 {
    position: sticky;
    left: var(--kw);
    z-index: 3;
    background: #f8f9fa;
    border-right: 2px solid var(--c-border);
  }
  .head.sticky-l1 { z-index: 5; background: #f3f4f6; border-right: 2px solid var(--c-border); }

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
    text-align: left;
  }
  .labelcell input:focus {
    outline: 1px solid var(--c-accent);
    border-radius: 3px;
  }
  .labelcell input::placeholder { color: #cbd5e1; }

  .band-cell {
    cursor: pointer;
    touch-action: none;
  }
  .band-cell.pending {
    background: #fff3a3;
    box-shadow: inset 0 0 0 2px #f59e0b;
  }

  /* バー（per-day セグメント） */
  .bar-seg {
    align-self: center;
    min-height: 32px;
    background: #fff;
    border-top: 1.5px solid #1a1a1a;
    border-bottom: 1.5px solid #1a1a1a;
    cursor: pointer;
    z-index: 2;
    position: relative;
    padding: 0;
    overflow: hidden;
  }
  .bar-seg.is-first { z-index: 3; }   /* オーバーレイ・ラベルを上に */
  .bar-seg.全日 { justify-self: stretch; }
  .bar-seg.am   { justify-self: start; width: 50%; }
  .bar-seg.pm   { justify-self: end;   width: 50%; }
  .bar-seg.is-first { border-left: 1.5px solid #1a1a1a; border-radius: 4px 0 0 4px; }
  .bar-seg.is-last  { border-right: 1.5px solid #1a1a1a; border-radius: 0 4px 4px 0; }
  .bar-seg.is-first.is-last { border-radius: 4px; }
  .bar-seg.kyoko {
    background: repeating-linear-gradient(45deg, #fff, #fff 4px, #ddd 4px, #ddd 8px);
    border-color: #6b7280;
    color: #6b7280;
  }
  /* バーラベル：バー範囲を覆う別グリッドアイテム。
     セル幅は max-content で広がるため overflow させない */
  .bar-label {
    align-self: center;
    min-height: 32px;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 4px;
    padding: 0 6px;
    pointer-events: none;
    z-index: 4;
    background: transparent;
    white-space: nowrap;
  }
  .bar-main {
    font-weight: 600;
    font-size: 12px;
    white-space: nowrap;
    flex: 0 0 auto;
  }
  .bar-sub {
    font-size: 10px;
    color: var(--c-muted);
    white-space: nowrap;
    flex: 0 0 auto;
  }
  .bar-h {
    font-size: 9px;
    color: var(--c-muted);
    background: rgba(255,255,255,0.85);
    padding: 0 2px;
    border-radius: 2px;
    flex: 0 0 auto;
  }

  .remark { padding: 2px 4px; }
  .remark input {
    width: 100%;
    min-height: 30px;
    padding: 2px 6px;
    font-size: 11px;
    border: none;
    background: transparent;
  }
  .remark input:focus { outline: 1px solid var(--c-accent); border-radius: 3px; }

  .total {
    background: #f3f4f6;
    font-weight: 600;
    color: var(--c-accent);
    font-size: 12px;
  }
  .total.muted-cell { background: #f8f9fa; color: transparent; }

  .ctrl-row {
    background: #fafafa;
    min-height: 30px;
  }
  .ctrl-row.labelcell { justify-content: flex-start; padding: 0 6px; }
  .ctrls { display: flex; gap: 4px; align-items: center; }
  .mini {
    min-height: 26px;
    font-size: 11px;
    padding: 0 6px;
  }

  .day-cell { cursor: pointer; min-height: 30px; }
  .day-cell:disabled { background: #f3f4f6; cursor: not-allowed; }
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
  .muted-cell { background: #f8f9fa; min-height: 30px; }
  .muted-cell.labelcell { min-height: 30px; }
  .ctrl-row-fixed { min-height: 26px; background: #fafafa; }
  .ctrl-row-fixed.labelcell { justify-content: flex-start; padding: 0 6px; }

  /* 項目名セル（人員のみ col 1、他は col 1+2 をマージ。rowspan で全サブ行を縦断） */
  .key-cell, .key-cell-wide {
    background: #f8f9fa;
    border-bottom: 1px solid var(--c-border);
    padding: 0 6px;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    min-height: 30px;
  }
  .key-cell-wide {
    border-right: 2px solid var(--c-border);
  }
  .key-text {
    font-size: 12px;
    font-weight: 700;
    color: var(--c-fg);
    text-align: left;
  }
  /* サブラベルセル（人員のみ） */
  .sub-label-cell {
    background: #f8f9fa;
    border-bottom: 1px solid var(--c-border);
    border-right: 2px solid var(--c-border);
    padding: 0 4px;
    display: flex;
    align-items: center;
    min-height: 30px;
  }
  .sub-label-input {
    min-width: 0;
    min-height: 24px;
    padding: 1px 4px;
    font-size: 11px;
    border: none;
    background: transparent;
    color: var(--c-fg);
    width: 100%;
    text-align: left;
  }
  .sub-label-input:focus {
    outline: 1px solid var(--c-accent);
    border-radius: 3px;
  }
  .sub-label-input::placeholder { color: #cbd5e1; }
</style>
