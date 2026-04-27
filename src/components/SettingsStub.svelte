<script>
  import { onMount } from 'svelte';
  import { loadSettings, saveSettings } from '../lib/db.js';
  import { screen, toasts } from '../lib/stores.js';

  /** @type {import('../lib/types.js').設定 | null} */
  let s = $state(null);

  onMount(async () => {
    s = await loadSettings();
  });

  async function save() {
    if (!s) return;
    await saveSettings(s);
    toasts.info('設定を保存しました');
    screen.set('home');
  }
</script>

<header>
  <button class="icon" onclick={() => screen.set('home')}>←</button>
  <h1>設定</h1>
  <button class="primary" onclick={save}>💾 保存</button>
</header>

<main>
  {#if !s}
    <p>読み込み中…</p>
  {:else}
    <p class="banner">⚠ Phase 5 で全機能実装予定。今は閲覧のみ。</p>

    <section>
      <h2>件名テンプレ</h2>
      <input type="text" bind:value={s.件名テンプレ} />
    </section>

    <section>
      <h2>工種辞書（{s.工種辞書.length}件）</h2>
      <ul>{#each s.工種辞書 as k (k)}<li>{k}</li>{/each}</ul>
    </section>

    <section>
      <h2>重機プリセット</h2>
      <ul>{#each s.重機プリセット as k (k)}<li>{k}</li>{/each}</ul>
    </section>

    <section>
      <h2>車両プリセット</h2>
      <ul>{#each s.車両プリセット as k (k)}<li>{k}</li>{/each}</ul>
    </section>

    <section>
      <h2>宛先プリセット</h2>
      {#if s.宛先プリセット.length === 0}
        <p class="muted">未登録</p>
      {:else}
        <ul>{#each s.宛先プリセット as a (a.メアド)}<li>{a.ラベル} &lt;{a.メアド}&gt;</li>{/each}</ul>
      {/if}
    </section>

    <section>
      <h2>GitHub</h2>
      {#if s.PAT暗号化}
        <p>登録済み</p>
      {:else}
        <p class="muted">未登録（Phase 5で登録UIを実装）</p>
      {/if}
    </section>
  {/if}
</main>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--c-border);
    background: #fff;
    position: sticky;
    top: 0;
    z-index: 10;
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
  main {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 720px;
    margin: 0 auto;
  }
  .banner {
    background: #fff7d6;
    border: 1px solid #f6d860;
    border-radius: 8px;
    padding: 10px 12px;
    margin: 0;
    font-size: 14px;
  }
  section {
    border: 1px solid var(--c-border);
    border-radius: 10px;
    padding: 12px 14px;
    background: #fff;
  }
  h2 {
    margin: 0 0 8px 0;
    font-size: 14px;
    color: var(--c-muted);
  }
  .muted {
    color: var(--c-muted);
    margin: 0;
  }
  ul {
    margin: 0;
    padding: 0 0 0 18px;
    font-size: 14px;
    line-height: 1.7;
  }
</style>
