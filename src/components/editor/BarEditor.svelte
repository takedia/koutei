<script>
  import { calcBarHours } from '../../lib/types.js';
  import { dateRange, formatYMD, dayOfWeekJa } from '../../lib/utils/date.js';

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
      // 同じ effect 内で `local.日別` を読まない（読むと local が依存に登録され、
      // 後段の setState() による local.日別 への書き込みで effect が再実行されて
      // 編集内容がリセットされ、ボタンが効かなくなる）。
      // そのためプレーンなオブジェクト上で初期化を済ませてから local に代入する。
      const cloned = JSON.parse(JSON.stringify(bar));
      if (!cloned.日別) cloned.日別 = {};
      local = cloned;
    }
  });

  function save() { if (local) onSave(local); }
  function del() {
    if (!confirm('このバーを削除します。よろしいですか？')) return;
    onDelete();
  }

  /** @param {string} d @returns {'全日'|'AM'|'PM'} */
  function stateOf(d) {
    return /** @type {any} */ (local?.日別?.[d] ?? '全日');
  }
  /** @param {string} d @param {'全日'|'AM'|'PM'} s */
  function setState(d, s) {
    if (!local) return;
    const map = { ...(local.日別 ?? {}) };
    if (s === '全日') delete map[d];
    else map[d] = s;
    local.日別 = map;
  }

  let days = $derived(local ? dateRange(local.開始, local.終了) : []);
  let hours = $derived(local ? calcBarHours(local) : 0);
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
          {formatYMD(local.開始)} 〜 {formatYMD(local.終了)} ({days.length}日)
        </div>

        <div class="day-list">
          {#each days as d (d)}
            {@const s = stateOf(d)}
            <div class="day-row">
              <span class="day-lab">{d.slice(5)} {dayOfWeekJa(d)}</span>
              <div class="seg3">
                <button class:on={s === '全日'} onclick={() => setState(d, '全日')}>全日 8h</button>
                <button class:on={s === 'AM'} onclick={() => setState(d, 'AM')}>AM 4h</button>
                <button class:on={s === 'PM'} onclick={() => setState(d, 'PM')}>PM 4h</button>
              </div>
            </div>
          {/each}
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
    flex: 1;
  }
  .seg3 button {
    flex: 1;
    min-height: 40px;
    background: #f9fafb;
    font-weight: 600;
  }
  .seg3 button.on {
    background: var(--c-accent);
    color: #fff;
    border-color: var(--c-accent);
  }
  .day-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 40dvh;
    overflow: auto;
  }
  .day-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .day-lab {
    font-size: 13px;
    width: 70px;
    flex-shrink: 0;
  }
  .toggles { display: flex; gap: 14px; }
  .chk { flex-direction: row; align-items: center; gap: 6px; color: var(--c-fg); font-size: 14px; }
  .chk input { min-height: 22px; width: 22px; height: 22px; }
  .hours { text-align: right; font-size: 14px; }
  footer { display: flex; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--c-border); }
  footer .del { background: #fee; border-color: #fcc; color: #b91c1c; }
  footer .save { flex: 1; }
</style>
