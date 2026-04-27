<script>
  import { calcBarHours } from '../../lib/types.js';
  import { formatYMD } from '../../lib/utils/date.js';

  /** @type {{
   *   open: boolean,
   *   bar: import('../../lib/types.js').Bar | null,
   *   onSave: (bar: import('../../lib/types.js').Bar) => void,
   *   onDelete: () => void,
   *   onCancel: () => void
   * }} */
  let { open, bar, onSave, onDelete, onCancel } = $props();

  /** @type {import('../../lib/types.js').Bar | null} */
  let local = $state(null);

  $effect(() => {
    if (open && bar) {
      local = JSON.parse(JSON.stringify(bar));
    }
  });

  function save() {
    if (local) onSave(local);
  }

  function del() {
    if (!confirm('このバーを削除します。よろしいですか？')) return;
    onDelete();
  }

  /**
   * @returns {'全日'|'AM'|'PM'}
   */
  function getMode() {
    if (!local) return '全日';
    if (local.始点位置 === 'AM') return 'AM';
    if (local.終点位置 === 'PM') return 'PM';
    return '全日';
  }

  /** @param {'全日'|'AM'|'PM'} m */
  function setMode(m) {
    if (!local) return;
    if (m === '全日') {
      local.始点位置 = '全日';
      local.終点位置 = '全日';
    } else if (m === 'AM') {
      local.始点位置 = 'AM';
      local.終点位置 = '全日';
    } else {
      local.始点位置 = '全日';
      local.終点位置 = 'PM';
    }
  }

  let hours = $derived(local ? calcBarHours(local) : 0);
  let mode = $derived(getMode());
</script>

{#if open && local}
  <div class="backdrop" role="dialog" aria-modal="true">
    <button class="bg" onclick={onCancel} aria-label="閉じる"></button>
    <div class="sheet">
      <header>
        <h2>バー編集</h2>
        <button class="x" onclick={onCancel} aria-label="閉じる">×</button>
      </header>

      <div class="body">
        <label>
          工種名（上段）
          <input type="text" bind:value={local.ラベル} />
        </label>
        <label>
          補足（下段：数量・延長・面積など）
          <input type="text" bind:value={local.サブラベル} placeholder="120m³ / L=12m など" />
        </label>

        <div class="period">
          {formatYMD(local.開始)} 〜 {formatYMD(local.終了)}
        </div>

        <div class="seg3">
          <button class:on={mode === '全日'} onclick={() => setMode('全日')}>全日 8h</button>
          <button class:on={mode === 'AM'}   onclick={() => setMode('AM')}>AM 4h</button>
          <button class:on={mode === 'PM'}   onclick={() => setMode('PM')}>PM 4h</button>
        </div>

        <div class="toggles">
          <label class="chk">
            <input type="checkbox" bind:checked={local.休工} />
            <span>休 休工扱い</span>
          </label>
        </div>

        <div class="hours">合計時間: <strong>{hours}h</strong></div>
      </div>

      <footer>
        <button class="del" onclick={del}>🗑 削除</button>
        <button class="primary save" onclick={save}>適用</button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column; justify-content: flex-end; }
  .bg { position: absolute; inset: 0; background: rgba(0,0,0,0.4); border: none; }
  .sheet {
    position: relative;
    background: #fff;
    border-top-left-radius: 16px;
    border-top-right-radius: 16px;
    max-height: 88dvh;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.18s ease-out;
  }
  @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--c-border);
  }
  header h2 { margin: 0; font-size: 16px; }
  .x { border: none; background: transparent; font-size: 24px; padding: 0 8px; }
  .body { padding: 14px; display: flex; flex-direction: column; gap: 12px; overflow: auto; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--c-muted); }
  label input { color: var(--c-fg); }
  .period { font-size: 14px; background: #f3f4f6; padding: 8px 12px; border-radius: 6px; }
  .seg3 {
    display: flex;
    gap: 4px;
  }
  .seg3 button {
    flex: 1;
    min-height: 44px;
    background: #f9fafb;
    font-weight: 600;
  }
  .seg3 button.on {
    background: var(--c-accent);
    color: #fff;
    border-color: var(--c-accent);
  }
  .toggles { display: flex; gap: 14px; }
  .chk { flex-direction: row; align-items: center; gap: 6px; color: var(--c-fg); font-size: 14px; }
  .chk input { min-height: 22px; width: 22px; height: 22px; }
  .hours { text-align: right; font-size: 14px; }
  footer { display: flex; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--c-border); }
  footer .del { background: #fee; border-color: #fcc; color: #b91c1c; }
  footer .save { flex: 1; }
</style>
