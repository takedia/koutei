<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import dayjs from 'dayjs';
  import { loadKoutei, saveKoutei } from '../lib/db.js';
  import { editingId, draftKoutei, screen, toasts } from '../lib/stores.js';
  import { formatRange, addDays } from '../lib/utils/date.js';
  import { rebuildDayCells } from '../lib/types.js';
  import { blockTotalHours } from '../lib/utils/bars.js';
  import Calendar from './editor/Calendar.svelte';
  import KoushuPicker from './editor/KoushuPicker.svelte';
  import BarEditor from './editor/BarEditor.svelte';
  import CellEditor from './editor/CellEditor.svelte';
  import { exportKouteiAsXlsx } from '../lib/export/xlsx.js';
  import { exportElementAsPng } from '../lib/export/png.js';
  import { exportElementAsPdf } from '../lib/export/pdf.js';
  import { makeFilename, downloadBlob } from '../lib/export/filename.js';
  import { renderSubject, defaultBody } from '../lib/export/mail.js';
  import { loadSettings } from '../lib/db.js';
  import ExportPreview from './ExportPreview.svelte';
  import MailCompose from './MailCompose.svelte';
  import { isStaleChunkError, reloadOnceForStaleChunk } from '../main.js';

  /** @type {HTMLDivElement | null} */
  let calendarRoot = $state(null);
  /** 画像/PDF キャプチャ対象（meta-row + topbar + calendar を含む） */
  /** @type {HTMLDivElement | null} */
  let exportRoot = $state(null);

  // プレビュー状態
  let previewOpen = $state(false);
  let previewKind = $state(/** @type {'png'|'pdf'|null} */ (null));
  let previewBlob = $state(/** @type {Blob|null} */ (null));
  let previewUrl = $state(/** @type {string|null} */ (null));
  let previewFilename = $state('');

  // メール作成モーダル状態
  let mailOpen = $state(false);
  let mailFilename = $state('');
  let mailSubject = $state('');
  let mailBody = $state('');
  /** @type {{ラベル:string, メアド:string}[]} */
  let mailPresets = $state([]);

  const isMobileUa = typeof navigator !== 'undefined' &&
    /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);

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
  let cellEditorNumericOnly = $state(false);
  /** @type {(v: string, kbn: '自社'|'リース'|'外注') => void} */
  let cellEditorCb = $state(() => {});

  onMount(async () => {
    // ExcelJS を先読み（ダウンロード時の await 短縮）
    import('exceljs').catch(() => {});

    const id = get(editingId);
    if (!id) {
      screen.set('home');
      return;
    }
    // 1) まずドラフト（新規作成直後）を確認
    const draft = get(draftKoutei);
    if (draft && draft.id === id) {
      koutei = draft;
      draftKoutei.set(null);   // consume
      dirty = false;
      loading = false;
      return;
    }
    // 2) DB から読み込み
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
    /** @type {Record<string, {kbn: '人員'|'重機等'|null, preset: '重機プリセット'|'車両プリセット'|'回送プリセット'|null, numericOnly?: boolean}>} */
    const meta = {
      '人員':   { kbn: null,     preset: null, numericOnly: true },  // 人員は 0〜20 の数字選択
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
    cellEditorNumericOnly = !!meta[key].numericOnly;
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

  /** 出力系エラー: 古いチャンク参照は自動リロード、それ以外はトースト */
  function handleExportError(/** @type {unknown} */ e) {
    console.error(e);
    if (isStaleChunkError(e)) {
      toasts.info('新しいバージョンに更新します…');
      if (reloadOnceForStaleChunk()) return;
    }
    toasts.error('出力失敗: ' + (/** @type {any} */ (e)?.message ?? e));
  }

  async function onExportXlsx() {
    if (!koutei) return;
    try {
      if (dirty) await save();
      const blob = await exportKouteiAsXlsx(koutei);
      downloadBlob(blob, makeFilename(koutei, 'xlsx'));
      toasts.info('Excelをダウンロードしました');
    } catch (e) {
      handleExportError(e);
    }
  }

  /** Excel を生成 → ダウンロード → メール作成画面を開く */
  async function onSendMailXlsx() {
    if (!koutei) return;
    try {
      if (dirty) await save();
      toasts.info('Excel生成中…');
      const blob = await exportKouteiAsXlsx(koutei);
      await startMailFlow(blob, makeFilename(koutei, 'xlsx'));
    } catch (e) {
      handleExportError(e);
    }
  }

  /** 画像/PDF キャプチャ対象 = meta-row + topbar + calendar を含む親 DOM */
  function getCaptureTarget() {
    return exportRoot;
  }

  /** 出力時に +/-項目 行を一時的に隠す */
  async function withPrintingClass(/** @type {() => Promise<any>} */ fn) {
    if (!exportRoot) return fn();
    exportRoot.classList.add('printing');
    // 1フレーム待ってレイアウトを確定
    await new Promise(resolve => requestAnimationFrame(resolve));
    try {
      return await fn();
    } finally {
      exportRoot.classList.remove('printing');
    }
  }

  function clearPreviewUrl() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
  }

  async function onExportPng() {
    if (!koutei) return;
    try {
      if (dirty) await save();
      const target = getCaptureTarget();
      if (!target) {
        toasts.error('画面要素が見つかりませんでした');
        return;
      }
      toasts.info('画像生成中…');
      const blob = await withPrintingClass(() =>
        exportElementAsPng(/** @type {HTMLElement} */ (target))
      );
      clearPreviewUrl();
      previewKind = 'png';
      previewBlob = blob;
      previewUrl = URL.createObjectURL(blob);
      previewFilename = makeFilename(koutei, 'png');
      previewOpen = true;
    } catch (e) {
      handleExportError(e);
    }
  }

  async function onExportPdf() {
    if (!koutei) return;
    try {
      if (dirty) await save();
      const target = getCaptureTarget();
      if (!target) {
        toasts.error('画面要素が見つかりませんでした');
        return;
      }
      toasts.info('PDF生成中…');
      const blob = await withPrintingClass(() =>
        exportElementAsPdf(/** @type {HTMLElement} */ (target))
      );
      const fname = makeFilename(koutei, 'pdf');
      // モバイルは iframe PDF プレビューが不安定なので即ダウンロード
      if (isMobileUa) {
        downloadBlob(blob, fname);
        toasts.info('PDFをダウンロードしました');
        return;
      }
      clearPreviewUrl();
      previewKind = 'pdf';
      previewBlob = blob;
      previewUrl = URL.createObjectURL(blob);
      previewFilename = fname;
      previewOpen = true;
    } catch (e) {
      handleExportError(e);
    }
  }

  function previewDownload() {
    if (!previewBlob || !previewFilename) return;
    downloadBlob(previewBlob, previewFilename);
    previewOpen = false;
    previewBlob = null;
    clearPreviewUrl();
    toasts.info('ダウンロードしました');
  }
  function previewClose() {
    previewOpen = false;
    previewBlob = null;
    clearPreviewUrl();
  }

  /** メール送信フロー: ファイルをダウンロードしてから MailCompose を開く */
  async function startMailFlow(/** @type {Blob} */ blob, /** @type {string} */ filename) {
    if (!koutei) return;
    try {
      // 添付用にダウンロードまで先に済ませる
      downloadBlob(blob, filename);
      const settings = await loadSettings();
      mailFilename = filename;
      mailSubject = renderSubject(settings.件名テンプレ ?? '', koutei);
      mailBody = defaultBody(filename);
      mailPresets = settings.宛先プリセット ?? [];
      mailOpen = true;
    } catch (e) {
      handleExportError(e);
    }
  }
  function previewSendMail() {
    if (!previewBlob || !previewFilename) return;
    const blob = previewBlob;
    const fname = previewFilename;
    // プレビューは閉じる（URL は MailCompose 完了後に解放したいので残す）
    previewOpen = false;
    startMailFlow(blob, fname);
    // 一連完了後にプレビュー残骸も掃除
    previewBlob = null;
    clearPreviewUrl();
  }
  function mailClose() { mailOpen = false; }
  function mailSent()  { mailOpen = false; toasts.info('メールアプリを開きました'); }
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
  <main>
    <div class="export-root" bind:this={exportRoot}>
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

      <div bind:this={calendarRoot}>
        <Calendar
          {block}
          periodStart={koutei.meta.対象期間.開始}
          periodEnd={koutei.meta.対象期間.終了}
          onChange={markDirty}
          onPickKoushu={openPicker}
          onEditBar={openBarEditor}
          onEditCell={openCellEditor}
        />
      </div>
    </div>

    <div class="footer-actions">
      <button onclick={copyPrevWeek}>🔁 前週コピー</button>
    </div>
    <div class="export-actions">
      <button class="primary" onclick={onExportXlsx}>📊 Excel</button>
      <button class="primary" onclick={onExportPng}>🖼 画像</button>
      <button class="primary" onclick={onExportPdf}>📄 PDF</button>
    </div>
    <div class="export-actions">
      <button class="primary mail" onclick={onSendMailXlsx}>✉️ Excel をメール送信</button>
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
  numericOnly={cellEditorNumericOnly}
  onSave={cellEditorCb}
  onCancel={() => cellEditorOpen = false}
/>

<ExportPreview
  open={previewOpen}
  kind={previewKind}
  url={previewUrl}
  filename={previewFilename}
  onDownload={previewDownload}
  onSendMail={previewSendMail}
  onCancel={previewClose}
/>

<MailCompose
  open={mailOpen}
  filename={mailFilename}
  defaultSubject={mailSubject}
  defaultBody={mailBody}
  presets={mailPresets}
  onCancel={mailClose}
  onSend={mailSent}
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
  .footer-actions, .export-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .footer-actions button, .export-actions button {
    flex: 1;
    min-height: 44px;
  }
  .export-actions {
    border-top: 1px solid var(--c-border);
    padding-top: 8px;
  }
</style>
