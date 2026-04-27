<script>
  import { toasts } from '../lib/stores.js';
</script>

<div class="toaster">
  {#each $toasts as t (t.id)}
    <div class="toast" class:error={t.kind === 'error'}>{t.msg}</div>
  {/each}
</div>

<style>
  .toaster {
    position: fixed;
    bottom: 20px;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    pointer-events: none;
    z-index: 100;
  }
  .toast {
    background: #1a1a1a;
    color: #fff;
    padding: 8px 14px;
    border-radius: 999px;
    font-size: 13px;
    pointer-events: auto;
    animation: pop 0.18s ease-out;
  }
  .toast.error {
    background: #dc2626;
  }
  @keyframes pop {
    from { transform: translateY(8px); opacity: 0; }
    to   { transform: translateY(0);   opacity: 1; }
  }
</style>
