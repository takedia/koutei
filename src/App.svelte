<script>
  import Home from './components/Home.svelte';
  import Editor from './components/Editor.svelte';
  import SettingsStub from './components/SettingsStub.svelte';
  import Toaster from './components/Toaster.svelte';
  import { screen } from './lib/stores.js';
</script>

{#if $screen === 'home'}
  <Home />
{:else if $screen === 'editor'}
  <Editor />
{:else if $screen === 'settings'}
  <SettingsStub />
{/if}

<Toaster />
