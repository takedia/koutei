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
   *   onPickKoushu: (cb: (label: string|null) => void) => void,
   *   onEditBar: (bandIdx: number, barIdx: number) => void,
   *   onEditCell: (date: string, key: '人員'|'重機'|'回送'|'車両'|'その他') => void
   * }} */
  let { block, periodStart, periodEnd, onChange, onPickKoushu, onEditBar, onEditCell } = $props();

  let dates = $derived(dateRange(periodStart, periodEnd));

  /** @type {{ band: number, date: string } | null} */
  let pendingStart = $state(null);

  const COL_WIDTH = 44;       // セル幅(px)
  const LABEL_WIDTH = 96;     // 行ラベル幅(px)

  /**
   * バンドのセルがタップされた
   * @param {number} bandIdx
   * @param {string} date
   */
  function onBandCellTap(bandIdx, date) {
    if (pendingStart && pendingStart.band === bandIdx) {
      const { 開始, 終了 } = makeRange(pendingStart.date, date);
      const start = pendingStart;
      pendingStart = null;
      onPickKoushu((label) => {
        if (!label) return;
        block.バンド[bandIdx].バー.push(createBar(label, 開始, 終了));
        onChange();
      });
    } else {
      pendingStart = { band: bandIdx, date };
    }
  }

  /** @param {number} bandIdx @param {number} barIdx */
  function onBarTap(bandIdx, barIdx, ev) {
    ev.stopPropagation();
    pendingStart = null;
    onEditBar(bandIdx, barIdx);
  }

  function addBand() {
    block.バンド.push({ バー: [] });
    onChange();
  }

  function removeBand() {
    if (block.バンド.length <= 1) return;
    if (!confirm('最後のバンドを削除します。バー情報も消えます。よろしいですか？')) return;
    block.バンド.pop();
    onChange();
  }

  /** @param {string} date */
  function colIndexOf(date) {
    return dates.indexOf(date);
  }

  /** @param {string} date */
  function dayClass(date) {
    const dow = dayOfWeek(date);
    const hol = holidayOf(date);
    if (dow === 0 || dow === 6 || hol) return 'holiday';
    return '';
  }

  /**
   * バーのスタイル（CSS grid内 absolute）
   * @param {import('../../lib/types.js').Bar} bar
   */
  function barStyle(bar) {
    const sIdx = colIndexOf(bar.開始);
    const eIdx = colIndexOf(bar.終了);
    if (sIdx < 0 || eIdx < 0) return 'display:none;';
    const left = sIdx * COL_WIDTH + (bar.始点位置 === 'AM' ? COL_WIDTH / 2 : 0);
    const right = (eIdx + 1) * COL_WIDTH - (bar.終点位置 === 'PM' ? COL_WIDTH / 2 : 0);
    return `left: ${left}px; width: ${right - left}px;`;
  }

  /** @param {string} date */
  function isPending(bandIdx, date) {
    return pendingStart && pendingStart.band === bandIdx && pendingStart.date === date;
  }

  /** @param {string} date @param {'人員'|'重機'|'回送'|'車両'|'その他'} key */
  function cellValue(date, key) {
    return block.日次セル[date]?.[key] ?? '';
  }
</script>

<div class="cal-wrap">
  <div class="cal" style="--cw: {COL_WIDTH}px; --lw: {LABEL_WIDTH}px;">
    <!-- ヘッダ -->
    <div class="row header">
      <div class="lab sticky-l">日付</div>
      {#each dates as d (d)}
        {@const hol = holidayOf(d)}
        <div class="cell head {dayClass(d)}" title={hol ?? ''}>
          <div class="dow">{dayOfWeekJa(d)}</div>
          <div class="d">{dayOfMonth(d)}</div>
        </div>
      {/each}
    </div>

    <!-- バンド -->
    {#each block.バンド as band, bi (bi)}
      <div class="row band">
        <div class="lab sticky-l">
          <div class="lab-text">作業 {bi + 1}</div>
          <div class="lab-sum">{band.バー.reduce((s, b) => s + calcBarHours(b), 0)}h</div>
        </div>
        {#each dates as d (d)}
          <button
            class="cell band-cell {dayClass(d)} {isPending(bi, d) ? 'pending' : ''}"
            onclick={() => onBandCellTap(bi, d)}
            aria-label={`${d} バンド${bi+1}`}
          ></button>
        {/each}
        <!-- バー（absolute オーバーレイ） -->
        <div class="bar-layer" style="left: {LABEL_WIDTH}px;">
          {#each band.バー as bar, idx (idx)}
            <button
              class="bar {bar.休工 ? 'kyoko' : ''}"
              style={barStyle(bar)}
              onclick={(e) => onBarTap(bi, idx, e)}
              aria-label={`バー: ${bar.ラベル}`}
            >
              <div class="bar-main">{bar.ラベル}</div>
              {#if bar.サブラベル}<div class="bar-sub">{bar.サブラベル}</div>{/if}
              {#if bar.雨天}<div class="rain">☂</div>{/if}
              <div class="bar-h">{calcBarHours(bar)}h</div>
            </button>
          {/each}
        </div>
      </div>
    {/each}

    <div class="row band-ctrl">
      <div class="lab sticky-l"></div>
      <div class="ctrl-buttons">
        <button class="mini" onclick={addBand}>＋バンド</button>
        {#if block.バンド.length > 1}
          <button class="mini" onclick={removeBand}>−バンド</button>
        {/if}
      </div>
    </div>

    <!-- 職長 -->
    <div class="row fixed">
      <div class="lab sticky-l">職長名</div>
      <div class="full-input">
        <input
          type="text"
          bind:value={block.職長名}
          oninput={onChange}
          placeholder="職長名"
        />
      </div>
    </div>

    <!-- 人員/重機/回送/車両/その他 -->
    {#each [['人員','人員'],['重機','重機'],['回送','回送'],['車両','車両'],['その他','その他']] as [key, label] (key)}
      <div class="row fixed">
        <div class="lab sticky-l">{label}</div>
        {#each dates as d (d)}
          <button
            class="cell day-cell {dayClass(d)}"
            onclick={() => onEditCell(d, key)}
          >
            <span class="day-val">{cellValue(d, key)}</span>
          </button>
        {/each}
      </div>
    {/each}
  </div>
</div>

<style>
  .cal-wrap {
    overflow-x: auto;
    overflow-y: visible;
    border: 1px solid var(--c-border);
    border-radius: 8px;
    background: #fff;
    -webkit-overflow-scrolling: touch;
  }
  .cal {
    display: flex;
    flex-direction: column;
    min-width: max-content;
    font-size: 12px;
  }
  .row {
    display: flex;
    align-items: stretch;
    border-bottom: 1px solid var(--c-border);
    position: relative;
  }
  .row:last-child {
    border-bottom: none;
  }
  .lab {
    width: var(--lw);
    min-width: var(--lw);
    padding: 4px 8px;
    background: #f8f9fa;
    border-right: 1px solid var(--c-border);
    display: flex;
    flex-direction: column;
    justify-content: center;
    font-size: 12px;
    color: var(--c-fg);
  }
  .lab-text {
    font-weight: 600;
  }
  .lab-sum {
    font-size: 11px;
    color: var(--c-muted);
  }
  .sticky-l {
    position: sticky;
    left: 0;
    z-index: 2;
  }
  .cell {
    width: var(--cw);
    min-width: var(--cw);
    border-right: 1px solid var(--c-border);
    background: #fff;
    padding: 0;
    margin: 0;
    border-top: none;
    border-bottom: none;
    border-left: none;
    border-radius: 0;
    min-height: 36px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .cell.holiday {
    background: var(--c-holiday);
  }
  .header .cell {
    min-height: 38px;
    line-height: 1.1;
    font-weight: 600;
  }
  .header .cell .dow { font-size: 11px; color: var(--c-muted); }
  .header .cell .d { font-size: 14px; }

  .band {
    min-height: 44px;
  }
  .band-cell {
    cursor: pointer;
  }
  .band-cell.pending {
    background: #fff3a3;
    box-shadow: inset 0 0 0 2px #f59e0b;
  }
  .band-ctrl {
    background: #fafafa;
    min-height: 36px;
  }
  .ctrl-buttons {
    display: flex;
    gap: 6px;
    padding: 4px 8px;
    align-items: center;
  }
  .mini {
    min-height: 28px;
    font-size: 12px;
    padding: 0 8px;
  }

  .bar-layer {
    position: absolute;
    top: 4px;
    bottom: 4px;
    pointer-events: none;
  }
  .bar {
    position: absolute;
    top: 0;
    bottom: 0;
    background: #fff;
    border: 1.5px solid #1a1a1a;
    border-radius: 4px;
    padding: 2px 6px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
    pointer-events: auto;
    cursor: pointer;
    line-height: 1.1;
    text-align: left;
  }
  .bar.kyoko {
    background: repeating-linear-gradient(45deg, #fff, #fff 4px, #ddd 4px, #ddd 8px);
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
    background: rgba(255,255,255,0.7);
    padding: 0 2px;
    border-radius: 2px;
  }
  .rain {
    position: absolute;
    top: 1px;
    right: 4px;
    font-size: 10px;
  }

  .fixed {
    min-height: 36px;
  }
  .fixed .lab {
    color: var(--c-muted);
    font-size: 12px;
    font-weight: 500;
  }
  .day-cell {
    cursor: pointer;
  }
  .day-val {
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
    text-align: center;
    padding: 0 2px;
  }
  .full-input {
    flex: 1;
    display: flex;
    padding: 4px 8px;
  }
  .full-input input {
    width: 100%;
    min-height: 30px;
    padding: 4px 8px;
    font-size: 13px;
  }
</style>
