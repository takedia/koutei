<script>
  import { onMount, tick } from 'svelte';
  import { get } from 'svelte/store';
  import dayjs from 'dayjs';
  import { loadKoutei, saveKoutei } from '../lib/db.js';
  import { editingId, screen, toasts } from '../lib/stores.js';
  import { formatRange, dateRange, addDays } from '../lib/utils/date.js';
  import { createKojiBlock, createEmptyDayCells } from '../lib/types.js';
  import { blockTotalHours } from '../lib/utils/bars.js';
  import Calendar from './editor/Calendar.svelte';
  import KoushuPicker from './editor/KoushuPicker.svelte';
  import BarEditor from './editor/BarEditor.svelte';
  import CellEditor from './editor/CellEditor.svelte';

  /** @type {import('../lib/types.js').Koutei | null} */
  let koutei = $state(null);
  let loading = $state(true);
  let dirty = $state(false);

  // Modals
  let pickerOpen = $state(false);
  /** @type {(label: string|null) => void} */
  let pickerCb = $state(() => {});

  let barEditorOpen = $state(false);
  let barEditorBlockIdx = $state(-1);
  let barEditorBandIdx = $state(-1);
  let barEditorBarIdx = $state(-1);

  let cellEditorOpen = $state(false);
  let cellEditorTitle = $state('');
  let cellEditorValue = $state('');
  /** @type {'人員プリセット'|'重機プリセット'|'車両プリセット'|null} */
  let cellEditorPresetKey = $state(null);
  /** @type {(v: string) => void} */
  let cellEditorCb = $state(() => {});

  onMount(async () => {
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

  function markDirty() {
    dirty = true;
  }

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
      const ok = confirm('保存していない変更があります。保存して戻りますか？');
      if (ok) await save();
    }
    screen.set('home');
  }

  /** @param {(label: string|null) => void} cb */
  function openPicker(cb) {
    pickerCb = cb;
    pickerOpen = true;
  }

  /** @param {string} label */
  function pickerSelect(label) {
    pickerOpen = false;
    pickerCb(label);
    markDirty();
  }

  function pickerCancel() {
    pickerOpen = false;
    pickerCb(null);
  }

  /** @param {number} blockIdx @param {number} bandIdx @param {number} barIdx */
  function openBarEditor(blockIdx, bandIdx, barIdx) {
    barEditorBlockIdx = blockIdx;
    barEditorBandIdx = bandIdx;
    barEditorBarIdx = barIdx;
    barEditorOpen = true;
  }

  /** @param {import('../lib/types.js').Bar} updated */
  function barEditorSave(updated) {
    if (!koutei) return;
    koutei.工事ブロック[barEditorBlockIdx].バンド[barEditorBandIdx].バー[barEditorBarIdx] = updated;
    barEditorOpen = false;
    markDirty();
  }

  function barEditorDelete() {
    if (!koutei) return;
    const arr = koutei.工事ブロック[barEditorBlockIdx].バンド[barEditorBandIdx].バー;
    arr.splice(barEditorBarIdx, 1);
    barEditorOpen = false;
    markDirty();
  }

  /**
   * セル編集を開く
   * @param {number} blockIdx
   * @param {string} date
   * @param {'人員'|'重機'|'回送'|'車両'|'その他'} key
   */
  function openCellEditor(blockIdx, date, key) {
    if (!koutei) return;
    const presetMap = {
      '人員': '人員プリセット',
      '重機': '重機プリセット',
      '回送': null,
      '車両': '車両プリセット',
      'その他': null
    };
    cellEditorTitle = `${date} ${key}`;
    cellEditorValue = koutei.工事ブロック[blockIdx].日次セル[date]?.[key] ?? '';
    cellEditorPresetKey = /** @type {any} */ (presetMap[key]);
    cellEditorCb = (v) => {
      if (!koutei) return;
      // 日次セル の対象日が無いケースに備えて初期化
      if (!koutei.工事ブロック[blockIdx].日次セル[date]) {
        koutei.工事ブロック[blockIdx].日次セル[date] = { 人員: '', 重機: '', 回送: '', 車両: '', その他: '' };
      }
      koutei.工事ブロック[blockIdx].日次セル[date][key] = v;
      cellEditorOpen = false;
      markDirty();
    };
    cellEditorOpen = true;
  }

  function cellEditorCancel() {
    cellEditorOpen = false;
  }

  function addBlock() {
    if (!koutei) return;
    koutei.工事ブロック.push(createKojiBlock(koutei.meta.対象期間.開始, koutei.meta.対象期間.終了));
    markDirty();
  }

  /** @param {number} idx */
  function removeBlock(idx) {
    if (!koutei) return;
    if (koutei.工事ブロック.length <= 1) {
      toasts.error('工事ブロックは最低1つ必要です');
      return;
    }
    if (!confirm(`工事ブロック${idx + 1}を削除します。よろしいですか？`)) return;
    koutei.工事ブロック.splice(idx, 1);
    markDirty();
  }

  /**
   * 期間種別切替（2週 ↔ 月間）
   * @param {'2週'|'月間'} kind
   */
  function changeKind(kind) {
    if (!koutei) return;
    if (koutei.meta.提出種別 === kind) return;
    if (!confirm(`${kind}に切り替えます。期間外のバー・セル入力は失われる可能性があります。よろしいですか？`)) return;

    const startBase = koutei.meta.対象期間.開始;
    const newStart = kind === '月間' ? dayjs(startBase).startOf('month').format('YYYY-MM-DD') : startBase;
    const days = kind === '月間' ? dayjs(newStart).daysInMonth() : 14;
    const newEnd = addDays(newStart, days - 1);

    koutei.meta.提出種別 = kind;
    koutei.meta.対象期間.開始 = newStart;
    koutei.meta.対象期間.終了 = newEnd;

    // 日次セル を新期間で再構築（既存値は保持）
    for (const block of koutei.工事ブロック) {
      const fresh = createEmptyDayCells(newStart, newEnd);
      for (const d of Object.keys(fresh)) {
        if (block.日次セル[d]) fresh[d] = block.日次セル[d];
      }
      block.日次セル = fresh;
    }
    markDirty();
  }

  /**
   * 前週コピー：既存バー全てを +7日した複製を追加（期間内のみ）
   */
  function copyPrevWeek() {
    if (!koutei) return;
    const end = koutei.meta.対象期間.終了;
    let added = 0;
    for (const block of koutei.工事ブロック) {
      for (const band of block.バンド) {
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

  // 期間スタート移動（2週ビュー時）
  /** @param {number} delta */
  function shiftPeriod(delta) {
    if (!koutei) return;
    if (koutei.meta.提出種別 !== '2週') return;
    const newStart = addDays(koutei.meta.対象期間.開始, delta);
    const newEnd = addDays(newStart, 13);
    koutei.meta.対象期間.開始 = newStart;
    koutei.meta.対象期間.終了 = newEnd;
    for (const block of koutei.工事ブロック) {
      const fresh = createEmptyDayCells(newStart, newEnd);
      for (const d of Object.keys(fresh)) {
        if (block.日次セル[d]) fresh[d] = block.日次セル[d];
      }
      block.日次セル = fresh;
    }
    markDirty();
  }

  /** @type {import('../lib/types.js').Bar | null} */
  let editingBar = $derived(
    barEditorOpen && koutei
      ? koutei.工事ブロック[barEditorBlockIdx]?.バンド[barEditorBandIdx]?.バー[barEditorBarIdx] ?? null
      : null
  );
</script>

<header>
  <button class="icon" onclick={back} aria-label="戻る">←</button>
  <h1>工程表 {dirty ? '●' : ''}</h1>
  <button class="primary" onclick={save}>💾</button>
</header>

{#if loading}
  <p class="muted">読み込み中…</p>
{:else if !koutei}
  <p class="muted">工程表が見つかりませんでした。</p>
{:else}
  <div class="topbar">
    <div class="seg">
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
  </div>

  <main>
    <section class="meta">
      <label>
        <span class="lab">発注者</span>
        <input type="text" bind:value={koutei.meta.発注者} oninput={markDirty} placeholder="○○建設" />
      </label>
    </section>

    {#each koutei.工事ブロック as block, bi (bi)}
      <section class="block">
        <div class="block-head">
          <h2>工事ブロック {bi + 1}<span class="hours">合計 {blockTotalHours(block)}h</span></h2>
          {#if koutei.工事ブロック.length > 1}
            <button class="rm" onclick={() => removeBlock(bi)} aria-label="削除">🗑</button>
          {/if}
        </div>

        <div class="row2">
          <label>
            <span class="lab">工事名</span>
            <input type="text" bind:value={block.工事名} oninput={markDirty} placeholder="○○線道路改良工事" />
          </label>
          <label class="num">
            <span class="lab">工事番号</span>
            <input type="text" bind:value={block.工事番号} oninput={markDirty} placeholder="001" />
          </label>
        </div>

        <Calendar
          {block}
          periodStart={koutei.meta.対象期間.開始}
          periodEnd={koutei.meta.対象期間.終了}
          onChange={markDirty}
          onPickKoushu={openPicker}
          onEditBar={(bandIdx, barIdx) => openBarEditor(bi, bandIdx, barIdx)}
          onEditCell={(date, key) => openCellEditor(bi, date, key)}
        />

        <label>
          <span class="lab">備考</span>
          <textarea bind:value={block.備考} oninput={markDirty} rows="2" placeholder="No.10+5 〜 No.12 ／ 天候により工程変更可能性あり"></textarea>
        </label>
      </section>
    {/each}

    <div class="footer-actions">
      <button onclick={addBlock}>＋工事ブロック追加</button>
      <button onclick={copyPrevWeek}>🔁 前週コピー</button>
    </div>
  </main>
{/if}

<KoushuPicker
  open={pickerOpen}
  onSelect={pickerSelect}
  onCancel={pickerCancel}
/>

<BarEditor
  bar={editingBar}
  onSave={barEditorSave}
  onDelete={barEditorDelete}
  onCancel={() => barEditorOpen = false}
/>

<CellEditor
  open={cellEditorOpen}
  title={cellEditorTitle}
  value={cellEditorValue}
  presetKey={cellEditorPresetKey}
  onSave={cellEditorCb}
  onCancel={cellEditorCancel}
/>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--c-border);
    background: #fff;
    position: sticky;
    top: 0;
    z-index: 20;
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
    font-size: 16px;
    text-align: center;
  }
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--c-border);
    background: #fafbfc;
    position: sticky;
    top: 49px;
    z-index: 19;
  }
  .seg {
    display: flex;
    background: #f3f4f6;
    border-radius: 8px;
    padding: 2px;
  }
  .seg button {
    border: none;
    background: transparent;
    min-height: 32px;
    padding: 0 12px;
    border-radius: 6px;
    font-size: 13px;
    color: var(--c-muted);
  }
  .seg button.on {
    background: #fff;
    color: var(--c-fg);
    box-shadow: 0 1px 2px rgba(0,0,0,0.08);
  }
  .period {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }
  .nav {
    border: 1px solid var(--c-border);
    background: #fff;
    min-height: 32px;
    min-width: 32px;
    padding: 0;
    border-radius: 6px;
  }
  main {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 1200px;
    margin: 0 auto;
  }
  .muted {
    text-align: center;
    color: var(--c-muted);
    margin: 24px;
  }
  .meta, .block {
    border: 1px solid var(--c-border);
    border-radius: 10px;
    padding: 12px;
    background: #fff;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .block-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .block-head h2 {
    margin: 0;
    font-size: 14px;
    color: var(--c-muted);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .hours {
    font-size: 12px;
    background: #eef2ff;
    color: var(--c-accent);
    border-radius: 4px;
    padding: 1px 6px;
    font-weight: 600;
  }
  .rm {
    background: transparent;
    border: 1px solid var(--c-border);
    min-height: 32px;
    padding: 0 10px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .lab {
    font-size: 12px;
    color: var(--c-muted);
  }
  .row2 {
    display: grid;
    grid-template-columns: 1fr 100px;
    gap: 8px;
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
