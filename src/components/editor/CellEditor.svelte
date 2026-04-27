<script>
  import { loadSettings, saveSettings } from '../../lib/db.js';
  import { onMount } from 'svelte';

  /** @type {{
   *   open: boolean,
   *   title: string,
   *   value: string,
   *   presetKey: '人員プリセット'|'重機プリセット'|'車両プリセット'|null,
   *   onSave: (v: string) => void,
   *   onCancel: () => void
   * }} */
  let { open, title, value, presetKey, onSave, onCancel } = $props();

  let local = $state('');
  let presets = $state(/** @type {string[]} */ ([]));
  /** @type {import('../../lib/types.js').設定 | null} */
  let settings = $state(null);

  $effect(() => {
    local = value ?? '';
  });

  onMount(async () => {
    settings = await loadSettings();
    if (presetKey && settings) {
      presets = settings[presetKey];
    }
  });

  /** @param {string} v */
  function pick(v) {
    local = v;
  }

  async function addPreset() {
    const v = local.trim();
    if (!v || !presetKey || !settings) return save();
    if (presets.includes(v)) return save();
    if (!confirm(`「${v}」をプリセットに追加します。よろしいですか？`)) {
      return save();
    }
    settings[presetKey] = [...presets, v];
    await saveSettings(settings);
    presets = settings[presetKey];
    save();
  }

  function save() {
    onSave(local.trim());
  }

  function clear() {
    local = '';
  }
</script>

{#if open}
  <div class="backdrop" role="dialog" aria-modal="true">
    <button class="bg" onclick={onCancel} aria-label="閉じる"></button>
    <div class="sheet">
      <header>
        <h2>{title}</h2>
        <button class="x" onclick={onCancel} aria-label="閉じる">×</button>
      </header>

      <div class="body">
        <!-- svelte-ignore a11y_autofocus -->
        <input type="text" bind:value={local} autofocus />

        {#if presets.length}
          <div class="presets">
            <p class="caption">プリセット（タップで入力）</p>
            <div class="grid">
              {#each presets as p (p)}
                <button onclick={() => pick(p)}>{p}</button>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <footer>
        <button class="ghost" onclick={clear}>クリア</button>
        {#if presetKey && local.trim() && !presets.includes(local.trim())}
          <button class="primary" onclick={addPreset}>＋辞書に追加して入力</button>
        {:else}
          <button class="primary save" onclick={save}>入力</button>
        {/if}
      </footer>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }
  .bg {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.4);
    border: none;
  }
  .sheet {
    position: relative;
    background: #fff;
    border-top-left-radius: 16px;
    border-top-right-radius: 16px;
    max-height: 80dvh;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.18s ease-out;
  }
  @keyframes slideUp {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--c-border);
  }
  header h2 { margin: 0; font-size: 16px; }
  .x { border: none; background: transparent; font-size: 24px; padding: 0 8px; }
  .body { padding: 14px; display: flex; flex-direction: column; gap: 14px; overflow: auto; }
  .caption { margin: 0; font-size: 12px; color: var(--c-muted); }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 6px;
    margin-top: 6px;
  }
  .grid button {
    text-align: left;
    padding: 8px 10px;
    background: #f9fafb;
    font-size: 13px;
    min-height: 38px;
  }
  footer {
    display: flex;
    gap: 8px;
    padding: 10px 14px;
    border-top: 1px solid var(--c-border);
  }
  .ghost {
    background: transparent;
  }
  footer .save, footer .primary { flex: 1; }
</style>
