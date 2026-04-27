<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import dayjs from 'dayjs';
  import { loadKoutei, saveKoutei } from '../lib/db.js';
  import { editingId, screen, toasts } from '../lib/stores.js';
  import { formatRange, addDays } from '../lib/utils/date.js';
  import { rebuildDayCells } from '../lib/types.js';
  import { blockTotalHours } from '../lib/utils/bars.js';
  import Calendar from './editor/Calendar.svelte';
  import KoushuPicker from './editor/KoushuPicker.svelte';
  import BarEditor from './editor/BarEditor.svelte';
  import CellEditor from './editor/CellEditor.svelte';
  import { exportKouteiAsXlsx } from '../lib/export/xlsx.js';
  import { makeFilename, downloadBlob } from '../lib/export/filename.js';

  /** @type {import('../lib/types.js').Koutei | null} */
  let koutei = $state(null);
  let loading = $state(true);
  let dirty = $state(false);

  let block = $derived(koutei?.工事ブロック?.[0] ?? null);

  // ── 工種ピッカー
  let pickerOpen = $state(false);
  /** @type {(label: string|null, opts?: {休工?: boolean}) => void} */
  let pickerCb = $state(() => {});

  // ── バー編集
  let barEditorOpen = $state(false);
  let barEditorBandIdx = $state(-1);
  let barEditorBarIdx = $state(-1);

  // ── セル編集
  let cellEditorOpen = $state(false);
  let cellEditorTitle = $state('');
  let cellEditorValue = $state('');
  let cellEditorKbn = $state(/** @type {'自社'|'リース'|'外注'} */ ('自社'));
  let cellEditorKbnType = $state(/** @type {'人員'|'重機等'|null} */ (null));
  let cellEditorPresetKey = $state(/** @type {'重機プリセット'|'車両プリセット'|'回送プリセット'|null} */ (null));
  /** @type {(v: string, kbn: '自社'|'リース'|'外注') => void} */
  let cellEditorCb = $state(() => {});

  onMount(async () => {
    // ExcelJS を先読み：ボタン押下時の await を最小化し、
    // ブラウザの user-gesture コンテキスト切れによるダウンロードブロックを回避
    import('exceljs').catch(() => {});

    const id = get(editingId);
    if (!id) {
      screen.set('home');
      return;
    }
    const loaded = await loadKoutei(id);
    if (!loaded) {
      toasts.error('工程表が見つかりませんでした');
      screen.set('home');
      return;
    }
    koutei = loaded;
    loading = false;
  });

  function markDirty() { dirty = true; }

  async function save() {
    if (!koutei) return;
    try {
      const updated = await saveKoutei(koutei);
      koutei.meta.最終更新 = updated.meta.最終更新;
      koutei.meta.版数 = updated.meta.版数;
      dirty = false;
      toasts.info('保存しました');
    } catch (e) {
      console.error(e);
      toasts.error('保存に失敗: ' + (e?.message ?? e));
    }
  }

  async function back() {
    if (dirty) {
      const ok = confirm('未保存の変更があります。\n破棄して戻る場合は OK、編集を続ける場合は キャンセル を押してください。\n（保存して戻りたい場合は、いったんキャンセル → 💾ボタンを押してから ← で戻ってください）');
      if (!ok) return;
    }
    screen.set('home');
  }

  /** @param {(label: string|null, opts?: {休工?: boolean}) => void} cb */
  function openPicker(cb) {
    pickerCb = cb;
    pickerOpen = true;
  }

  /** @param {string} label @param {{休工?: boolean}} [opts] */
  function pickerSelect(label, opts) {
    pickerOpen = false;
    pickerCb(label, opts);
    markDirty();
  }
  function pickerCancel() {
    pickerOpen = false;
    pickerCb(null);
  }

  /** @param {number} bandIdx @param {number} barIdx */
  function openBarEditor(bandIdx, barIdx) {
    barEditorBandIdx = bandIdx;
    barEditorBarIdx = barIdx;
    barEditorOpen = true;
  }
  /** @param {import('../lib/types.js').Bar} updated */
  function barEditorSave(updated) {
    if (!block) return;
    block.バンド[barEditorBandIdx].バー[barEditorBarIdx] = updated;
    block.バンド = block.バンド;
    barEditorOpen = false;
    markDirty();
  }
  function barEditorDelete() {
    if (!block) return;
    block.バンド[barEditorBandIdx].バー.splice(barEditorBarIdx, 1);
    block.バンド = block.バンド;
    barEditorOpen = false;
    markDirty();
  }

  /**
   * @param {string} date
   * @param {'人員'|'重機'|'回送'|'車両'|'その他'} key
   * @param {number} subIdx
   */
  function openCellEditor(date, key, subIdx) {
    if (!block) return;
    /** @type {Record<string, {kbn: '人員'|'重機等'|null, preset: '重機プリセット'|'車両プリセット'|'回送プリセット'|null}>} */
    const meta = {
      '人員':   { kbn: null,     preset: null },          // 人員はサブ行ラベルが区分の役割
      '重機':   { kbn: '重機等', preset: '重機プリセット' },
      '回送':   { kbn: '重機等', preset: '回送プリセット' },
      '車両':   { kbn: '重機等', preset: '車両プリセット' },
      'その他': { kbn: '重機等', preset: null }
    };
    if (!block.日次セル[date]) {
      block.日次セル = rebuildDayCells(
        koutei.meta.対象期間.開始,
        koutei.meta.対象期間.終了,
        block.固定行数,
        block.日次セル
      );
    }
    const arr = block.日次セル[date][key];
    const entry = arr[subIdx] ?? { 値: '', 区分: '自社' };
    cellEditorTitle = `${date} ${key}${arr.length > 1 ? (subIdx + 1) : ''}`;
    cellEditorValue = entry.値;
    cellEditorKbn = /** @type {any} */ (entry.区分);
    cellEditorKbnType = /** @type {any} */ (meta[key].kbn);
    cellEditorPresetKey = meta[key].preset;
    cellEditorCb = (v, kbn) => {
      if (!block) return;
      block.日次セル[date][key][subIdx] = { 値: v, 区分: kbn };
      block.日次セル = block.日次セル;
      cellEditorOpen = false;
      markDirty();
    };
    cellEditorOpen = true;
  }

  /** 期間種別切替（即時切替） */
  function changeKind(/** @type {'2週'|'月間'} */ kind) {
    if (!koutei) return;
    if (koutei.meta.提出種別 === kind) return;

    const startBase = koutei.meta.対象期間.開始;
    const newStart = kind === '月間' ? dayjs(startBase).startOf('month').format('YYYY-MM-DD') : startBase;
    const days = kind === '月間' ? dayjs(newStart).daysInMonth() : 14;
    const newEnd = addDays(newStart, days - 1);

    koutei.meta.提出種別 = kind;
    koutei.meta.対象期間.開始 = newStart;
    koutei.meta.対象期間.終了 = newEnd;

    for (const b of koutei.工事ブロック) {
      b.日次セル = rebuildDayCells(newStart, newEnd, b.固定行数, b.日次セル);
    }
    markDirty();
  }

  function copyPrevWeek() {
    if (!koutei) return;
    const end = koutei.meta.対象期間.終了;
    let added = 0;
    for (const b of koutei.工事ブロック) {
      for (const band of b.バンド) {
        const newBars = [];
        for (const bar of band.バー) {
          const ns = addDays(bar.開始, 7);
          const ne = addDays(bar.終了, 7);
          if (ns > end) continue;
          newBars.push({ ...bar, 開始: ns, 終了: ne > end ? end : ne });
          added++;
        }
        band.バー = [...band.バー, ...newBars];
      }
    }
    if (added === 0) {
      toasts.info('複製対象のバーがありませんでした');
    } else {
      toasts.info(`${added}本のバーを+7日でコピーしました`);
      markDirty();
    }
  }

  /** @param {number} delta */
  function shiftPeriod(delta) {
    if (!koutei) return;
    if (koutei.meta.提出種別 !== '2週') return;
    const newStart = addDays(koutei.meta.対象期間.開始, delta);
    const newEnd = addDays(newStart, 13);
    koutei.meta.対象期間.開始 = newStart;
    koutei.meta.対象期間.終了 = newEnd;
    for (const b of koutei.工事ブロック) {
      b.日次セル = rebuildDayCells(newStart, newEnd, b.固定行数, b.日次セル);
    }
    markDirty();
  }

  let editingBar = $derived(
    barEditorOpen && block
      ? block.バンド[barEditorBandIdx]?.バー[barEditorBarIdx] ?? null
      : null
  );

  async function onExportXlsx() {
    if (!koutei) return;
    try {
      // 出力前に必ず保存（最新状態で出力）
      if (dirty) await save();
      const blob = await exportKouteiAsXlsx(koutei);
      downloadBlob(blob, makeFilename(koutei, 'xlsx'));
      toasts.info('Excelをダウンロードしました');
    } catch (e) {
      console.error(e);
      toasts.error('出力失敗: ' + (e?.message ?? e));
    }
  }
</script>

<header>
  <button class="icon" onclick={back} aria-label="戻る">←</button>
  <h1>工程表 {dirty ? '●' : ''}</h1>
  <button class="primary" onclick={save}>💾</button>
</header>

{#if loading}
  <p class="muted">読み込み中…</p>
{:else if !koutei || !block}
  <p class="muted">工程表が見つかりませんでした。</p>
{:else}
  <section class="meta-row">
    <input class="ipt" type="text" bind:value={koutei.meta.発注者} oninput={markDirty} placeholder="発注者" aria-label="発注者" />
    <input class="ipt num" type="text" bind:value={block.工事番号} oninput={markDirty} placeholder="工事番号" aria-label="工事番号" />
    <input class="ipt flex" type="text" bind:value={block.工事名} oninput={markDirty} placeholder="工事名" aria-label="工事名" />
    <input class="ipt" type="text" bind:value={block.職長名} oninput={markDirty} placeholder="職長名" aria-label="職長名" />
  </section>

  <section class="topbar">
    <div class="seg-strong">
      <button class:on={koutei.meta.提出種別 === '2週'} onclick={() => changeKind('2週')}>2週</button>
      <button class:on={koutei.meta.提出種別 === '月間'} onclick={() => changeKind('月間')}>月間</button>
    </div>
    <div class="period">
      {#if koutei.meta.提出種別 === '2週'}
        <button class="nav" onclick={() => shiftPeriod(-7)} aria-label="1週前">‹</button>
      {/if}
      <span>{formatRange(koutei.meta.対象期間.開始, koutei.meta.対象期間.終了)}</span>
      {#if koutei.meta.提出種別 === '2週'}
        <button class="nav" onclick={() => shiftPeriod(7)} aria-label="1週後">›</button>
      {/if}
    </div>
    <div class="hours-pill">{blockTotalHours(block)}h</div>
  </section>

  <main>
    <Calendar
      {block}
      periodStart={koutei.meta.対象期間.開始}
      periodEnd={koutei.meta.対象期間.終了}
      onChange={markDirty}
      onPickKoushu={openPicker}
      onEditBar={openBarEditor}
      onEditCell={openCellEditor}
    />
    <div class="footer-actions">
      <button onclick={copyPrevWeek}>🔁 前週コピー</button>
      <button class="primary" onclick={onExportXlsx}>📊 Excel出力</button>
    </div>
  </main>
{/if}

<KoushuPicker
  open={pickerOpen}
  onSelect={pickerSelect}
  onCancel={pickerCancel}
/>

<BarEditor
  open={barEditorOpen}
  bar={editingBar}
  onSave={barEditorSave}
  onDelete={barEditorDelete}
  onCancel={() => barEditorOpen = false}
/>

<CellEditor
  open={cellEditorOpen}
  title={cellEditorTitle}
  value={cellEditorValue}
  区分={cellEditorKbn}
  区分種別={cellEditorKbnType}
  presetKey={cellEditorPresetKey}
  onSave={cellEditorCb}
  onCancel={() => cellEditorOpen = false}
/>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--c-border);
    background: #fff;
    position: sticky;
    top: 0;
    z-index: 30;
  }
  .icon {
    border: none;
    background: transparent;
    font-size: 22px;
    min-width: 36px;
    padding: 0;
  }
  h1 {
    flex: 1;
    margin: 0;
    font-size: 15px;
    text-align: center;
  }
  .meta-row {
    display: flex;
    gap: 4px;
    padding: 6px 8px;
    background: #fff;
    border-bottom: 1px solid var(--c-border);
    overflow-x: auto;
  }
  .ipt {
    min-width: 88px;
    min-height: 36px;
    padding: 4px 8px;
    font-size: 13px;
    border: 1px solid var(--c-border);
    border-radius: 6px;
  }
  .ipt.flex { flex: 1; min-width: 140px; }
  .ipt.num { width: 90px; min-width: 90px; }

  .topbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--c-border);
    background: #fafbfc;
    position: sticky;
    top: 49px;
    z-index: 29;
  }
  .seg-strong {
    display: flex;
    border: 1.5px solid var(--c-accent);
    border-radius: 8px;
    overflow: hidden;
  }
  .seg-strong button {
    border: none;
    background: #fff;
    color: var(--c-accent);
    min-height: 34px;
    padding: 0 14px;
    font-size: 13px;
    font-weight: 600;
    border-radius: 0;
  }
  .seg-strong button.on {
    background: var(--c-accent);
    color: #fff;
  }
  .period {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    flex: 1;
    justify-content: center;
  }
  .nav {
    border: 1px solid var(--c-border);
    background: #fff;
    min-height: 32px;
    min-width: 32px;
    padding: 0;
    border-radius: 6px;
  }
  .hours-pill {
    background: #eef2ff;
    color: var(--c-accent);
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 700;
  }
  main {
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 100%;
    margin: 0 auto;
  }
  .muted {
    text-align: center;
    color: var(--c-muted);
    margin: 24px;
  }
  .footer-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .footer-actions button {
    flex: 1;
    min-height: 44px;
  }
</style>
